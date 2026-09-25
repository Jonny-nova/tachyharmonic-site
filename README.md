# Tachyharmonic website

The static website for tachyharmonic.ai, rebuilt from the Tachyharmonic brand system (25 September 2026). The brand source lives in the adjacent Brand and Design workspace folder.

The original Jonathan portrait is stored at assets/images/jonathan-portrait.png. The page uses an 800-pixel WebP delivery copy at assets/images/jonathan-portrait-800.webp, with the original as a fallback. The image is shown in the "What kind of mind am I hiring?" section without a forced crop.

The live wordmark uses the approved light SVG mark and Newsreader text. The favicon and mark in public/assets are production copies from the adjacent Brand and Design logo folder. LOGO_SPEC.md there is authoritative for the mark, including the raised solid circle; keep the canonical originals in that folder.

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
