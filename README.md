# Tachyharmonic website

The static website for tachyharmonic.ai, rebuilt from the Tachyharmonic brand system (25 September 2026). The brand source lives in the adjacent Brand and Design workspace folder.

The original Jonathan portrait is stored at assets/images/jonathan-portrait.png. The homepage crop is controlled with CSS, so the original remains intact.

## Local preview

From this repository, run:

    python -m http.server 8000

Open http://localhost:8000.

## Check

    npm ci
    npm test

The check validates internal anchors, local resources, and the root CNAME.

## Publishing

The repository remains a static GitHub Pages site. The root CNAME contains tachyharmonic.ai and must remain at the root. A local rebuild or pull request does not publish the new site.

The contact destination in the page must be set to a verified address or booking link before release.
