/**
 * Open sign-up is off by default and only an admin can turn it on.
 *
 * While the switch is on, anyone can create a plain user account through
 * POST /api/auth/register, with the same password rules and the login rate
 * limit. Those accounts can never get the admin role. The Login page shows
 * the sign-up form only when the status endpoint says it is on.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('server/routes/auth.js');
const appConfig = read('server/routes/app-config.js');
const login = read('src/routes/Login.svelte');
const users = read('src/components/settings/SettingsUserManagement.svelte');
const en = JSON.parse(read('src/i18n/en.json'));

test('the switch is read from app_config and defaults to off', () => {
  assert.match(auth, /function registrationOpen\(\)[\s\S]*?=== 'true'/);
});

test('anonymous sign-up is allowed only while the switch is on, and never as admin', () => {
  const route = auth.slice(auth.indexOf("router.post('/register'"));
  assert.match(route, /const openSignup = !isFirst && registrationOpen\(\)/);
  assert.match(route, /!isFirst && !openSignup && \(!req\.user \|\| req\.user\.role !== 'admin'\)/);
  assert.match(route, /const assignedRole = isFirst \? 'admin' : \(!openSignup && role === 'admin' \? 'admin' : 'user'\)/);
});

test('sign-up requests from non-admins go through the login rate limit', () => {
  assert.match(auth, /function rateLimitSignup[\s\S]*?return rateLimitLogin\(req, res, next\)/);
  assert.match(auth, /router\.post\('\/register', rateLimitSignup,/);
});

test('the status endpoint reports the switch as a boolean', () => {
  assert.match(auth, /registration_open: registrationOpen\(\)/);
});

test('admins can set the switch to true or false only', () => {
  assert.match(appConfig, /'registration_open',\n\]\);/);
  assert.match(appConfig, /key === 'registration_open' && value !== 'true' && value !== 'false'/);
});

test('the Login page shows the sign-up link and form only when the switch is on', () => {
  assert.match(login, /registrationOpen = data\.registration_open === true/);
  assert.match(login, /\{#if registrationOpen\}/);
  assert.match(login, /fetch\(apiUrl\('\/api\/auth\/register'\)/);
});

test('Settings → Users saves the switch through app-config', () => {
  assert.match(users, /key: 'registration_open', value: on \? 'true' : 'false'/);
});

test('every new user-facing string exists in en.json', () => {
  for (const k of ['open', 'create', 'creating', 'back', 'email', 'email_placeholder', 'password_hint', 'failed']) {
    assert.ok(en.login.signup[k], `login.signup.${k}`);
  }
  for (const k of ['open_signup', 'open_signup_desc', 'err_open_signup']) {
    assert.ok(en.settings.users[k], `settings.users.${k}`);
  }
});
