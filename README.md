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

The intake form is a visual and interaction preview. It does not send or save answers, book a session or take payment. Its submit button is disabled until a real booking flow is agreed and connected.

## Check

    npm ci
    npm test

The check validates internal anchors, local resources, the root CNAME, and the booking-rule boundary cases.

## Booking system status

The authoritative booking rules are in [docs/BOOKING_SYSTEM_SPEC.md](docs/BOOKING_SYSTEM_SPEC.md). The pricing section explains how supported places grow. The booking calculation and transactional gate contract live in [booking](booking); their architecture and outstanding integration decisions are recorded in [BOOKING_IMPLEMENTATION.md](BOOKING_IMPLEMENTATION.md).

The gate is local server-only code. The public form remains a non-submitting preview. No Calendly, Stripe or Google Calendar account is connected by this repository, and no service credentials belong in GitHub Pages JavaScript.

## Publishing

The repository remains a static GitHub Pages site. The root CNAME contains tachyharmonic.ai and must remain at the root. A local rebuild or pull request does not publish the new site.

The booking, payment and meeting flow still needs a verified integration before release. The public AI questions should receive Jonathan's editorial review before publication.

## Working on changes

For a small one-person correction, follow the relevant authority, inspect the affected page, make the change, and report what was checked. No assignment, ledger entry, or formal check-in is needed unless it changes product intent, release scope, or a meaningful decision.

For substantive work, record the request and its source in [project memory](docs/PROJECT_MEMORY.md); keep decision state separate from delivery state. Resolve unclear product authority with Jonny before treating it as approved. If work spans components or contributors, name one integration owner and the shared integration target, then agree nonoverlapping deliverables and dependencies before parallel edits. The owner assembles one website candidate and checks the whole visitor path, including copy, choices, failure states, and accessibility, with independent review where the release risk warrants it. Record implementation checks, integrated verification, Jonny's acceptance, and publication separately. A changed decision updates only the work that depends on it; retain the earlier record and link the refinement or supersession.

If scope or delegation expands unexpectedly, pause to reconcile the requirement and integration target before assigning more work.

At a new objective, expanded assignment, material correction, or integrated review, the central coordinator reads `../.codex/coordinator-working-note.md` if present, explains its current understanding and uncertainty, and checks the specific point with Jonny; this local note is optional and outside Git. If Jonny says he does not understand or corrects an interpretation, pause dependent delegation, explain the present state in plain English, check the specific misunderstanding, reconcile affected plans or assignments, and update the note after a material correction. Give delegated agents only the corrected requirement and boundaries, and instruct them not to read or forward the note. This is a behavioural boundary, not technical access control, because agents share the filesystem.
