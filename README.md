# Tachyharmonic website

The static website for tachyharmonic.ai, rebuilt from the Tachyharmonic brand system (25 September 2026). The brand source lives in the adjacent Brand and Design workspace folder.

The original Jonathan portrait is stored at assets/images/jonathan-portrait.png. The page uses an 800-pixel WebP delivery copy at assets/images/jonathan-portrait-800.webp, with the original as a fallback. The image is shown in the "What kind of mind am I hiring?" section without a forced crop.

The live wordmark uses the approved light SVG mark and Newsreader text. The favicon and mark in public/assets are production copies from the adjacent Brand and Design logo folder. LOGO_SPEC.md there is authoritative for the mark, including the raised solid circle; keep the canonical originals in that folder.

## Project memory and authority

Start with the [current snapshot and intention ledger](docs/PROJECT_MEMORY.md) for the current objective, ownership, open decisions, and evidence. Jonny owns product decisions; a proposal or a branch is not approval.

The adjacent [master brand system](<../Brand and Design/TACHYHARMONIC_MASTER_BRAND_SYSTEM.md>) (v1.0, 25 September 2026) governs the brand's experience, content, voice, and visual direction; the packaged [logo specification](<../Brand and Design/Tachyharmonic_Brand_Design_System_v1.0/tachyharmonic_brand_v1/logo/LOGO_SPEC.md>) governs the mark. These sources live outside this Git repository. Their relative links work in this workspace, but a standalone checkout does not contain them and cannot reproduce their authority without separately obtaining and checking the kit. For booking economics, use the in-repository [booking specification](docs/BOOKING_SYSTEM_SPEC.md); [BOOKING_IMPLEMENTATION.md](BOOKING_IMPLEMENTATION.md) records local implementation and proposals, not replacement rules.

## Local preview

From this repository, run:

    python -m http.server 8000

Open http://localhost:8000.

The public configuration points to the production booking Worker after Jonathan's GO LIVE decision. See [current project memory](docs/PROJECT_MEMORY.md) for deployment and test status.

## Check

    npm ci
    npm test

Checks cover internal anchors/resources/CNAME, booking economics and availability, backend lifecycle/security, provider adapters, frontend recovery and the local OAuth helper. Local workerd tests verify SQLite persistence and concurrency; they are distinct from real-provider acceptance.

## Booking system status

The authoritative booking rules are in [docs/BOOKING_SYSTEM_SPEC.md](docs/BOOKING_SYSTEM_SPEC.md). The pricing section explains how supported places grow. The booking calculation and transactional gate contract live in [booking](booking); their architecture and outstanding integration decisions are recorded in [BOOKING_IMPLEMENTATION.md](BOOKING_IMPLEMENTATION.md).

The server uses a Cloudflare Worker and SQLite Durable Object, Stripe Checkout, Google Calendar + Meet, and Resend. Staging remains separate for sandbox validation; production configuration enables public booking. Jonny approved direct Google scheduling after Calendly could not meet the no-bypass rule. No service credential belongs in GitHub Pages JavaScript. Deployment and operation are described in [backend setup](backend/README.md).

`node scripts/build-staging.js` assembles an explicit allowlist of public assets in ignored `.local/staging-assets`, with a staging banner and noindex. `npm run build:backend` builds that default-disabled preview and performs a deployment dry run. It does not publish. The production CNAME and private source/credentials are excluded from the staging assets.

## Publishing

The repository remains a static GitHub Pages site. The root CNAME contains tachyharmonic.ai and must remain at the root. A local rebuild or pull request does not publish the new site.

The booking, payment and meeting integration has passed staging and one controlled private live validation. Jonathan accepted the public terms, monthly retention responsibility and GO LIVE on 28 September 2026. The public rollout and smoke results are recorded separately in [project memory](docs/PROJECT_MEMORY.md).

## Working on changes

For a small one-person correction, follow the relevant authority, inspect the affected page, make the change, and report what was checked. No assignment, ledger entry, or formal check-in is needed unless it changes product intent, release scope, or a meaningful decision.

For substantive work, record the request and its source in [project memory](docs/PROJECT_MEMORY.md); keep decision state separate from delivery state. Resolve unclear product authority with Jonny before treating it as approved. If work spans components or contributors, name one integration owner and the shared integration target, then agree nonoverlapping deliverables and dependencies before parallel edits. The owner assembles one website candidate and checks the whole visitor path, including copy, choices, failure states, and accessibility, with independent review where the release risk warrants it. Record implementation checks, integrated verification, Jonny's acceptance, and publication separately. A changed decision updates only the work that depends on it; retain the earlier record and link the refinement or supersession.

If scope or delegation expands unexpectedly, pause to reconcile the requirement and integration target before assigning more work.

At a new objective, expanded assignment, material correction, or integrated review, the central coordinator reads `../.codex/coordinator-working-note.md` if present, explains its current understanding and uncertainty, and checks the specific point with Jonny; this local note is optional and outside Git. If Jonny says he does not understand or corrects an interpretation, pause dependent delegation, explain the present state in plain English, check the specific misunderstanding, reconcile affected plans or assignments, and update the note after a material correction. Give delegated agents only the corrected requirement and boundaries, and instruct them not to read or forward the note. This is a behavioural boundary, not technical access control, because agents share the filesystem.
