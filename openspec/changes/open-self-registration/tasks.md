# Tasks

## 1. Server

- [x] 1.1 Read `registration_open` from `app_config`; default off.
- [x] 1.2 Change `POST /api/auth/register`: anonymous requests allowed only when the switch is on; force role `user`
      for them; keep first-account and admin paths unchanged.
- [x] 1.3 Apply `rateLimitLogin` to the register route.
- [x] 1.4 Add the switch to the app-config route for admins only; include it in the public status response as a boolean.

## 2. Client

- [x] 2.1 Login page: "Create account" link and sign-up form, shown only when the status says sign-up is on.
- [x] 2.2 Settings → Users: "Allow sign-up" switch with a one-line warning about open sign-up.
- [x] 2.3 Add every new string to `src/i18n/en.json`; run `npm run i18n:check`.

## 3. Tests and checks

- [ ] 3.1 Server tests for the 403 with switch off, role forcing, admin-only switch, password policy, rate limit. (Open: source checks plus a scratch API run; no test of the rate limit itself.)
- [x] 3.2 `npm test` and `npm run i18n:check` on Node 24.
- [ ] 3.3 Local check of the login page with the switch on and off, then stop every server and delete scratch data. (Open: API checked on a scratch server; the page itself not yet checked in a browser.)

## 4. Docs and release

- [ ] 4.1 Owner reviews this change; apply only after approval.
- [ ] 4.2 PR into `diaitika`; deploy only after the owner says so, per `docs/runbooks/update-nutritrace.md`.
- [ ] 4.3 Record in `diaitika-infra/docs/history/` and update `docs/projects.md` if the sign-up switch changes how the server is run.
