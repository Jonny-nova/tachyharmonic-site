# Local Google authorization setup

For the separate staging preview, `node scripts/build-staging.js` copies only an explicit public-file allowlist into ignored `.local/staging-assets`. It excludes credentials, source backend, tests and the production CNAME. It adds noindex and a test-only banner. The default remains disabled; `--enable-test-booking` is only for a deliberately opened sandbox test window with configured providers. This does not edit the public source configuration.

Run this one-time helper only after Jonathan explicitly agrees to the persistent calendar permissions. It does not enable bookings, create appointments, change calendars, deploy code or copy credentials into Cloudflare.

1. In the dedicated Google OAuth project, create a **Web application** client and register the exact redirect `http://127.0.0.1:8765/oauth/callback`. Enable Calendar API. Download its client JSON into a private location outside the tracked source tree.
2. From the site root, run `node scripts/google-oauth-setup.js "C:\private\downloaded-client.json"`, replacing only the local file path. No secret belongs in the command itself.
3. Open the printed Google authorization URL in the intended host account and review the requested permissions. The helper requests only `calendar.events.owned` and `calendar.events.freebusy`, offline access and fresh consent. It verifies random callback state and uses an S256 PKCE verifier. The local listener binds only `127.0.0.1:8765` and times out after ten minutes.
4. Success creates ignored `.local/google-credentials.json` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`. Neither access tokens nor authorization codes are saved. Existing credential files are never overwritten silently. POSIX permissions are restricted to the owner; on Windows the helper removes inherited file ACLs and grants the current user access before writing secrets.
5. Use the deployment's protected secret-input mechanism to install the three values; do not print the JSON, paste it into chat, capture it in screenshots or commit it. Verify actual scope/calendar access and token renewal separately. Preserve the original client download as secret material too.

The authorization URL contains the public client ID, random state and challenge, not the client secret or verifier. Callback URLs/codes and token responses are never logged. Do not share even the temporary authorization URL as a routine setup log. Failure output uses fixed codes only. Missing refresh token or missing required scope fails without saving credentials.

Pure local tests, with mocked token responses and no listener/network authorization:

```text
node --test scripts/google-oauth-setup.test.js
```

Primary references: [Google web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google's PKCE verifier/challenge description](https://developers.google.com/identity/protocols/oauth2/native-app#step1), and [FreeBusy scopes](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query). FreeBusy explicitly accepts `calendar.events.freebusy`. An external OAuth project left in Testing normally issues a seven-day refresh token for these scopes; see [refresh-token expiry](https://developers.google.com/identity/protocols/oauth2#expiration). This helper does not change that publishing/verification status.
