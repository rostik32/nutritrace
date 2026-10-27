/**
 * SMTP host, port, username and from values are trimmed; the password is not.
 *
 * A space pasted after the Brevo username made the relay refuse the login
 * (400 from Send Test) with no hint in the form. The value is trimmed where it
 * is read and where it is saved, so a stored value with a space is fixed too.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = readFileSync(new URL('../server/email.js', import.meta.url), 'utf8');
const body = src.match(/export function cleanSmtpValue[\s\S]*?\n}\n/)?.[0];
const cleanSmtpValue = new Function(`${body.replace('export ', '')}\nreturn cleanSmtpValue;`)();

test('username, host and from are trimmed', () => {
  assert.equal(cleanSmtpValue('smtp_user', 'c02c98001@smtp-brevo.com '), 'c02c98001@smtp-brevo.com');
  assert.equal(cleanSmtpValue('smtp_host', ' smtp-relay.brevo.com'), 'smtp-relay.brevo.com');
  assert.equal(cleanSmtpValue('smtp_from', 'NutriTrace <help@diaitika.com> '), 'NutriTrace <help@diaitika.com>');
});

test('password is kept as typed', () => {
  assert.equal(cleanSmtpValue('smtp_pass', 'key with space '), 'key with space ');
});

test('non-string and empty values pass through', () => {
  assert.equal(cleanSmtpValue('smtp_port', 465), 465);
  assert.equal(cleanSmtpValue('smtp_user', null), null);
  assert.equal(cleanSmtpValue('smtp_user', '   '), '');
});
