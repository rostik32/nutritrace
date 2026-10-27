# Design

## Context

`POST /api/auth/register` (server/routes/auth.js) creates the first account without a session, and after that
requires an admin session. The switch is stored in `app_config`, like the SMTP and AI settings, and read through the
settings route in server/routes/app-config.js. The login page is src/routes/Login.svelte; the admin settings for
users are in src/components/settings/SettingsUserManagement.svelte.

## Decisions

- **Switch in `app_config`, key `registration_open`** (`'true'` or absent). Off when absent, so an existing install
  behaves as before. No env variable in this change: the owner controls it in Settings, and an env lock can be added
  later if needed.
- **Anonymous branch in the register route.** The existing check becomes: first account allowed; otherwise an admin
  session is required, or the switch is on. With the switch on, the role is forced to `user`. The existing
  `role === 'admin'` branch stays for admins only.
- **Rate limit:** reuse the login limiter (`rateLimitLogin`) on the register route, so one client cannot create accounts
  in a loop. No CAPTCHA.
- **Email is optional and unverified.** It is stored as typed, but auto-linking of Google logins keeps using only
  verified email from the identity provider, so an unverified address cannot take over an existing account.
- **Login page** reads the switch from the public status endpoint (`GET /api/auth/status` already runs before login), so
  the link and form appear without a signed-in session.

## Risks

- Abuse: strangers can create many accounts. Mitigation: the rate limit now, a CAPTCHA or email verification later if
  needed.
- Data: a new user starts empty; no data is shared between accounts. Sharing features stay opt-in as before.
- Status endpoint must not reveal anything beyond the switch value.

## Test plan

- Node 24: `npm test` and `npm run i18n:check`.
- Unit: register returns 403 anonymously with the switch off; returns 201-style success with the switch on and role
  `user`; admin-only switch change; password policy and rate limit apply.
- Browser (local dev server only, then stopped): switch off hides the form; switch on shows it; a new account can log in.
