# Booking backend setup and operation

Updated 28 September 2026. This guide describes the candidate and its operator controls; current provider acceptance and deployment evidence belong in [project memory](../docs/PROJECT_MEMORY.md) and the [continuation evidence](../docs/V1-CANDIDATE-2026-09-27.md). Read the [implementation boundary](../BOOKING_IMPLEMENTATION.md) and [booking economics](../docs/BOOKING_SYSTEM_SPEC.md) first.

The selected scheduler is **Google Calendar + Google Meet**, following Jonny's explicit approval in this integration task. Stripe handles payment/refunds; Resend is the implemented transactional-email adapter. Cloudflare Worker + one SQLite Durable Object provide private storage and serialized capacity decisions. No AI preparation service is connected.

## Checks and deployment structure

Use Node 22-compatible tooling and the locked development dependencies:

```text
npm ci
npm test
npm run build:backend
npm run dev:backend
```

`build:backend` runs Wrangler with `--dry-run`; it does not deploy. `dev:backend` starts a local Worker. Tests include Node SQLite and local workerd/Miniflare persistence across runtime restart. Restricted Windows sandboxes can block esbuild's ancestor-directory access; approved filesystem access may be needed for those local tests.

`wrangler.jsonc` binds `BOOKING_OFFICE` to `BookingOffice`. Migration `v1` creates its SQLite class using `new_sqlite_classes`. The named object `tachyharmonic-all-weeks-v1` is the single ledger for this environment. Changing the name creates a different ledger; later class/schema changes need explicit migrations. Do not delete a namespace to clear a test if it could contain real records. Use separate staging/production resources and credentials when adding production.

Both `BOOKING_ENABLED` and the frontend `js/booking-config.js` switch default to false. Publishing a Worker or passing its health check does not enable the public form. Actual deployment and public go-live remain separately recorded coordinator decisions.

## Configuration

Non-secret configuration can use Worker variables. Calendar IDs can identify private accounts; prefer secret storage to committing actual values.

| Variable | Value or purpose |
| --- | --- |
| `BOOKING_ENABLED` | `false` by default; enable only the intended verified environment. |
| `SCHEDULER_PROVIDER` | `google` for the approved V1 route. |
| `CALENDAR_SOURCE` | `google`, reading all three calendars directly. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins, including scheme/port. No wildcard. |
| `CONSENT_VERSION` | `v1-2026-09-27`, matching `booking/consent.js` and the frontend. Wording comes from that shared file. |
| `DATE_OPENINGS` | JSON array of `{date:"YYYY-MM-DD",start:"HH:mm",end:"HH:mm"}` London-local additions; default `[]`. Ordinary rules still apply. |
| `MANAGEMENT_BASE_URL` | HTTPS frontend handling `#booking=…&token=…` recovery links. |
| `STRIPE_MODE` | `test` by default. |
| `STRIPE_INTEGRATION_IDENTIFIER` | Stable identifier ending in a hyphen and eight lowercase letters. |
| `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` | HTTPS frontend return pages. Adapter adds an opaque booking-ID fragment, never the management capability. |
| `GOOGLE_CALENDAR_PRIMARY` / `GOOGLE_CALENDAR_WORK` / `GOOGLE_CALENDAR_HOME` | Three distinct accessible conflict-calendar IDs. |
| `GOOGLE_BOOKING_CALENDAR` | Host calendar receiving appointments; defaults to Primary. Keep it covered by the conflict-calendar setup. |
| `TRANSACTIONAL_FROM` | Verified `Display Name <address>` sender on the domain/subdomain, separate from the personal `jonathan@tachyharmonic.ai` mailbox. |
| `TRANSACTIONAL_DOMAIN_VERIFIED` | `true` only after actual sender/domain verification and delivery checks. |
| `TRADER_ADDRESS` | Verified geographic trader/contact address approved for customers. Required before availability, holds and Checkout. Prefer secret storage until approved for public disclosure. |

| Secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Environment-specific key for Checkout, reconciliation and refunds. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of this environment's Stripe endpoint. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | Dedicated host OAuth client and offline calendar authorization. |
| `RESEND_API_KEY` | Transactional sending credential. |
| `ADMIN_TOKEN` | Strong, separately generated operator credential. |
| `MANAGEMENT_SIGNING_SECRET` | At least 32 random characters of server-only signing material, distinct from admin credentials. |

Use Cloudflare encrypted secret controls or Wrangler's interactive secret prompt. Supply the secret name and enter its value through the protected prompt; never put values in shell arguments, tracked scripts, chat, screenshots or logs. Local credentials belong in ignored `.dev.vars`/`.local` material. No provider/admin/signing credential belongs in frontend configuration, a tracked example file or Git.

Rotating the signing secret invalidates existing email recovery links, so plan recovery first. Original browser capabilities are separate. Capability URLs grant booking status/cancellation access; keep them out of analytics, logs and issue bodies. They cannot read intake notes.

Live payments additionally require `ALLOW_LIVE_PAYMENTS=true` with matching live credentials. That is an explicit later financial/release configuration, not the default candidate. Stripe test success does not prove live refund liquidity or payout readiness.

## Google authorization

Enable Calendar API in the selected OAuth project. Use a dedicated web OAuth client with exact authorized redirect URIs and offline host consent. Verify granted scopes for all operations actually used: free/busy on Primary/Work/Home, event insert/get/list/delete and calendar-access verification. The account needs writer/owner access to the booking calendar and Google Meet capability. No OAuth token or calendar contents are sent to the browser.

Test a busy interval independently on each calendar. Missing/error/incomplete data must stay unavailable; never replace a failed read with an empty array. Keep the booking calendar among the checked calendars. Invitation content contains only required identity/time/meeting details, fixed service text and opaque private correlation, never intake notes.

An external Google OAuth consent configuration in **Testing** issues refresh tokens that expire after seven days, except for limited basic-profile scopes that do not cover this Calendar workflow. Verify publishing/verification status before relying on unattended operation and test revoked/expired authorization. A testing refresh token is not permanent. See [Google refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

Google event IDs are deterministic; canonical checks verify correlation, appointment details and Meet readiness. Cancellation checks expected start/end and uses the current ETag to protect the final delete against intervening edits; see [Google conditional modification](https://developers.google.com/workspace/calendar/api/guides/version-resources). Unknown creation retains capacity for reconciliation. A missing event after an uncertain write is not proof that no event was committed.

There is no public Google scheduling page in this path. Declining the invitation does not itself perform the controlled cancellation/refund action. Host calendar edits are detected by periodic canonical reads. Retained Calendly code and its webhook route are compatibility code, not prerequisites for `SCHEDULER_PROVIDER=google`.

## HTTP API

Responses are JSON with `Cache-Control: no-store`. Dates are ISO instants with timezones. Rates are numeric GBP offers `30`, `50`, `70`, `100`, `140`; response `amount` is GBP pence. Browser inputs cannot select a trusted amount or status.

| Method and route | Input/authentication | Result |
| --- | --- | --- |
| `GET /api/health` | None | `{status:"ok",bookingEnabled:boolean}`; not provider readiness. |
| `GET /api/availability` | `from`, `to`, `rate`; interval at most seven days | `{slots:[{available,reason,startsAt,endsAt}],rate}`. |
| `GET /api/availability` | Alternative: `startsAt`, `rate` | One slot's availability/reason. |
| `POST /api/holds` | JSON below and `Idempotency-Key` | `201` sanitized held booking; same input/key replays, changed input conflicts. |
| `POST /api/bookings/:id/checkout` | Visitor bearer capability | `{checkoutUrl,status}`. |
| `GET /api/bookings/:id` | Visitor bearer capability | Sanitized state/offer/time/expiry/refund/external-change flag, plus confirmed Meet link. No contact/note/token. |
| `POST /api/bookings/:id/cancel` | Visitor bearer capability | `202` pending/review state; HTTP acceptance is not cancellation/refund proof. |
| `POST /api/webhooks/stripe` | Raw body and verified `Stripe-Signature` | Deduplicated payment transition or refund reconciliation. |
| `GET /api/admin/bookings/:id` | Administrator bearer credential | Private contact, eligible note, choice/contract record, resolution history and sanitized recovery-job summary; audited read. |
| `POST /api/admin/bookings/:id/resolve` | Administrator; action/reason below | Canonical provider check and audited human decision. |

Hold body:

```json
{
  "startsAt": "2026-10-15T10:00:00Z",
  "rate": 50,
  "name": "Client name",
  "email": "client@example.test",
  "note": "Optional, at most 1200 characters",
  "earlyStart": false,
  "consentVersion": "v1-2026-09-27",
  "managementToken": "<32 random bytes encoded as 43 base64url characters>"
}
```

The example capability is a placeholder, not accepted input. Generate fresh cryptographic capability/idempotency values. Retry uncertain holds with identical input/key/token. The server persists hashes. Browser session storage contains booking capabilities, not name/email/note form data.

The server snapshots the full versioned booking/cancellation information at hold, including its configured trader address. The unchanged private snapshot travels into confirmation email alongside contract time, cancellation deadline and recorded consent. Later configuration changes do not rewrite an existing contract snapshot. `booking/contract-terms.js` is still candidate legal text awaiting final human approval.

Errors return non-sensitive codes: invalid fields `400`, auth `401`, rejected browser origin `403`, state/slot conflict `409`, oversized body `413`, body type `415`, and persisted per-IP limit `429`. Disabled booking/provider unavailability fails closed, normally `503`. Webhooks use signatures/canonical verification rather than visitor authorization.

## Human operation

Use a trusted API client with administrator authorization loaded privately from the environment's secret store and header masking enabled. Never put a credential in the URL or a saved example command. Select the opaque reference from an operational alert and retrieve the private admin route.

Review provider appointment/payment/refund facts, the request and statutory rights. Notes are accessible only for a confirmed appointment whose early-preparation gate permits access. Opening the record does not measure human preparation or authorize a fee.

For `confirmed`/`review_requested` records, send `{action,reasonCode}` to the resolve route:

- `retain` requires the exact original provider appointment active and returns it to confirmed.
- `cancel` records human approval and starts whole cancellation/refund. A verified already-canceled appointment proceeds to refund pending; otherwise capacity remains protected during cancellation.

Use a non-sensitive reason such as `statutory_cancellation_approved`; only lowercase letters, digits and underscores, 3–80 characters, are accepted. Action/reason/time/provider status are retained. A moved appointment or unknown state is rejected for investigation. There is no generic move, partial-double cancellation, arbitrary refund amount or self-service reschedule endpoint.

For a **known terminal failed refund**, the same authenticated resolve route accepts:

```json
{"action":"retry_refund","reasonCode":"verified_failure_retry"}
```

This is available only for a `booking_failed` or `canceled` booking with `refundStatus: attention_required`, a known payment and a known current refund. The backend independently reads Stripe's complete refund list for that payment. The old refund must match the booking and full amount and be `failed` or `canceled`; any other pending, successful, action-required or unknown refund prevents another full-amount attempt. Incomplete or failed provider reads also reject the action. Stripe's refundable-amount limit remains the final guard against an external refund racing this check.

The decision and reason are audited before a replacement is queued. Earlier refund IDs, verified status, time and generation remain in durable `refundHistory`; the private resolution history records the previous ID. Each explicitly approved replacement receives a new durable generation and stable idempotency key. Uncertain retries of that attempt reuse the same key. Repeating the admin action while the replacement is pending is rejected. Canonical monitoring targets the current refund ID; lost-response recovery excludes the retained earlier attempts. No arbitrary refund amount or automatic sequence of replacement generations is exposed.

A known refund response of `requires_action`, `failed` or `canceled` immediately becomes `attention_required`, without an initiation claim. A definitive Stripe request rejection with HTTP 400 or 422 also becomes durable `attention_required` with the safe reason `provider_refund_rejected`. That job stops retrying; its generation, history and audit are preserved, pending/operator notices are queued, and no refund ID is invented. Network, timeout and server failures remain retryable uncertainty. A rejection without a new refund ID cannot use `retry_refund` to manufacture another generation: investigate with the payment provider and arrange any necessary customer resolution separately. A scripted failing sandbox card can reject a replacement too; record that definite test outcome rather than claiming a successful refund.

The admin read returns `recovery.pendingJobs`, containing only each unfinished job's `kind`, `status`, `attempts`, `due`, `firstAttemptAt` and `pastAutomaticIdempotencyWindow`. It excludes message snapshots, capabilities and provider payloads. A future `due` value can explain why an otherwise recovered booking still displays `retryPending`. That flag is recalculated across all attempted unfinished jobs, including email, after job completion and during repair. It clears after the final recovery, while human review, external changes, failed bookings and refund attention retain their separate operational meaning. `pendingJobs: []` does not prove that an attention-required financial issue has been resolved.

Reread after resolution. `initiated` confirms Stripe acceptance only. A later correlated signed refund event triggers a fresh canonical read even after an earlier successful result; if that read fails, normal alarms keep checking. `attention_required`, external changes or prolonged paid `confirming` state need investigation. Never edit stored status, fabricate a provider ID or mark manual payment/refund completion to make uncertainty look complete. Restoring provider access permits reconciliation where the canonical operation can be identified; permanently ambiguous creation or an operation past its safe idempotency window requires deliberate provider/operator handling and an incident record. The resolve endpoint is not a general repair tool for every provider state.

## Retry, storage and retention

The ledger is one SQL state document plus an append-only safe-action audit table. Hold/private/idempotency changes commit atomically; network calls are outside SQL transactions. Preserve the whole ledger during backup/migration, including pending work.

- Holds last 15 minutes. Stripe Checkout lasts longer due to its provider minimum; alarms expire known Sessions and refund late paid holds.
- Alarms recur roughly every minute, rotating through at most five relevant records and five jobs. Retry delay grows exponentially to at most one hour.
- Lost Checkout identities are searched in a bounded range by exact opaque correlation. Unknown event creation retains capacity. Failed Meet creation is compensated by canceling the event before refunding.
- Stable keys protect refunds/email. Beyond 23 hours, uncertain refunds are reconciled instead of resubmitted; uncertain mail waits for manual handling. Immutable snapshots and state checks suppress stale success/pending messages.
- Failure-episode keys allow a later refund/cancellation failure to alert again. Sender failures remain queued; verify independent operator monitoring before launch.
- The administrator-only Google verification probe additionally requires the exact staging hostname, test mode and explicit `STAGING_PROVIDER_CHECKS=true`; leave it disabled during ordinary operation. Temporary fault-injection wrappers used for acceptance are ignored local tooling, not the normal candidate entry point. Restore the ordinary Worker after a controlled test.
- Failed/expired hold notes clear in cleanup. Confirmed notes clear 30 days after appointment start, with cleanup before private reads. This does not prove deletion from backups. Contact/financial/audit/backup retention remain policy-review items.

Raw management capabilities and signing secrets are absent from the SQL ledger/outbox. Email capabilities are derived at send time. Routine audit actions contain safe action names and opaque references, not intake text or provider-response bodies.

## Proof required before paid launch

Complete the deployed test-mode journey: three-calendar availability, trusted offer/hold, Checkout, signed webhook, one canonical event and ready Meet link, delivered transaction mail, cross-device management, whole cancellation and accepted refund. Exercise expiry/duplicate/out-of-order/timeout cases on configured services. Verify OAuth renewal, alerts, old booking routes, refund liquidity, backups/retention, final privacy/legal wording and human acceptance. Local tests and a health response are not that proof; default switches remain closed.
