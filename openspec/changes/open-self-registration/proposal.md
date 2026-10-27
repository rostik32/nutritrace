# Proposal

## Why

Today only the first account can register itself. Every later account comes from an admin (Settings → Users, or an
invite by email or link), so the owner cannot let anyone else sign up on nutri.diaitika.com. The owner chose open
self-registration: anyone who reaches the site can create an account, with a username and password.

## What Changes

- Admin switch "Allow sign-up" in Settings → Users. Off by default, so nothing changes until an admin turns it on.
- `POST /api/auth/register` accepts requests without an admin session only while the switch is on. Such accounts always
  get the role `user`, never `admin`. The same password policy and the same login rate limit apply.
- Login page: a "Create account" link (shown only while the switch is on) and a sign-up form: username, password,
  optional email, optional display name.
- New UI strings are keys in `src/i18n/en.json`.
- **Security note for the owner:** open sign-up means strangers can create accounts on the same server. Their data
  stays per user, but the server load and the number of accounts grow. Email is optional and not verified in this
  change, so it is never used to link an account to a Google login.

## Capabilities

### New Capabilities
- `user-registration`: whether and how a person can create their own NutriTrace account (the sign-up switch, the
  anonymous sign-up request, the role it gets, and the sign-up form).

### Modified Capabilities
- None. Admin-created accounts and invites keep their current behaviour.

## Impact

- `server/routes/auth.js` (register route, rate limit), `server/routes/app-config.js` (new key `registration_open`),
  `server/db.js` only if a migration is needed (none planned: the setting lives in `app_config`).
- `src/routes/Login.svelte`, `src/components/settings/SettingsUserManagement.svelte`, `src/i18n/*.json`.
- No new dependencies, no new env variables, no change to deployed config until the owner approves a deploy.

## Out of scope

- Email verification for new accounts, CAPTCHA or other bot checks (a separate decision if sign-up turns out to be abused).
- Google sign-up (configured separately as an OIDC provider; its own decision on auto-register).
- Deployment to nut.diaitika.com (a separate step per the runbook, after the owner reviews this change).
- Upstream: no. The sign-up switch is specific to this fork's hosting, so it is not offered to TraceApps/nutritrace.
