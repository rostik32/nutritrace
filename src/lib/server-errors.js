/**
 * server-errors.js — show the server's English error messages in the app
 * language.
 *
 * The server answers `{ error: 'English text' }` and the client shows that
 * text in toasts and inline errors. The server stays as it is (its messages
 * also reach API clients and logs); `localizeError(msg)` swaps a message it
 * knows for the `server_errors.*` translation at display time and returns
 * anything else unchanged. Never compare the result against server text:
 * keep comparisons on the raw message.
 *
 * Covered: what a person using the app can run into (sign-in, sign-up,
 * invites, passwords, setup, session/CSRF/rate limit, profile, users,
 * imports and backups, foods/meals/recipes, sharing, settings). Messages
 * only the public API (/api/v1, MCP) sends are left out.
 */
import { t } from './i18n-t.js';
import { ZXCVBN_FEEDBACK_EN, zxcvbnFeedbackKey } from './password-strength.js';

const S = 'server_errors.';

// Exact server text → i18n key (keys without a dot are under server_errors.).
const EXACT = new Map(Object.entries({
  // Session, access, limits
  'Not authenticated': 'not_signed_in',
  'Not logged in': 'not_signed_in',
  'Unauthorized': 'not_signed_in',
  'Admin only': 'admin_only',
  'Forbidden': 'forbidden',
  'Invalid CSRF token': 'invalid_csrf',
  'Setup required': 'setup_required',
  'Request body too large': 'body_too_large',
  'Internal server error': 'internal',
  'Not found': 'not_found',
  // Thrown in English by the connect-to-server screens (callers compare
  // against these, so they are translated here, at display time).
  'Server not reachable': 'server_unreachable',
  'Could not reach server': 'common.errors.cant_reach_server',
  'Login failed': 'login_failed',

  // Sign-in
  'Invalid username or password': 'invalid_credentials',
  'Username and password required': 'username_password_required',
  'Too many login attempts for this account. Try again later.': 'too_many_logins_account',
  'Too many login attempts. Try again in a few minutes.': 'too_many_logins',
  'Password login is disabled. Use Single Sign-On instead.': 'password_login_disabled',
  'You are already signed in. Use Settings to disable user management.': 'already_signed_in',
  'Sign-in expired. Please try again.': 'sign_in_expired',
  'Sign-in failed': 'sign_in_failed',
  // Single sign-on (OIDC), including the codes sent back in ?oidc_error=
  'callback_failed': 'oidc_callback_failed',
  'link_failed': 'oidc_link_failed',
  'Unlink failed': 'unlink_failed',
  'No NutriTrace account is linked to this identity. Ask your admin to enable Auto-register new users on this provider, or have them invite you first.': 'oidc_no_account',
  'This provider identity is already linked to a different NutriTrace account.': 'oidc_already_linked',
  'Cannot unlink your last sign-in method. Set a password first, or link another provider.': 'oidc_last_method',
  'Provider not found': 'oidc_provider_not_found',
  'This provider is configured via environment variables and cannot be edited from the UI.': 'oidc_provider_env_locked',
  'This setting is locked by the OIDC_ENABLE_EMAIL_PASSWORD_LOGIN environment variable and cannot be changed from the admin UI.': 'oidc_password_login_env_locked',
  'Discovery failed': 'oidc_discovery_failed',

  // Passwords (same rules as src/lib/validation.js)
  'Password must be at least 8 characters': 'password.rules.min_length',
  'Password must include a lowercase letter': 'password.rules.needs_lowercase',
  'Password must include an uppercase letter': 'password.rules.needs_uppercase',
  'Password must include a number': 'password.rules.needs_number',
  'Password must include a special character': 'password.rules.needs_special',
  'Use a longer, less predictable password': 'password.zxcvbn.default_tip',
  'Current password is incorrect': 'current_password_incorrect',
  'Current password required': 'current_password_required',
  'New password required': 'new_password_required',
  'Token and password required': 'reset_fields_required',
  'Invalid or expired reset link': 'reset_link_invalid',
  'Reset link has expired': 'reset_link_expired',
  'Invalid or expired link': 'link_invalid',
  'Invalid recovery token.': 'recovery_token_invalid',
  'Recovery not available. Set RECOVERY_TOKEN environment variable.': 'recovery_unavailable',
  "The app's address is unknown. Set PUBLIC_URL, then try again.": 'public_url_unknown',

  // Invites, sign-up, user management
  'Token, username and password required': 'username_password_required',
  'Invalid or already used invite link': 'invite_invalid',
  'Invite link has expired': 'invite_expired',
  'Invite not found': 'invite_not_found',
  'An account with this email already exists. Sign in instead.': 'email_exists_sign_in',
  'User not found': 'user_not_found',
  'Cannot delete yourself': 'cannot_delete_self',
  'Cannot delete the only admin account.': 'cannot_delete_only_admin',
  'Cannot delete the only admin account. Transfer admin to another user first.': 'cannot_delete_only_admin_transfer',
  'Cannot demote the only admin. Promote another user to admin first.': 'cannot_demote_only_admin',
  'Cannot change your own role': 'cannot_change_own_role',
  'Invalid role': 'invalid_role',
  'UNIQUE constraint failed: users.username': 'username_taken',
  'UNIQUE constraint failed: users.email': 'email_taken',

  // Email / SMTP, app config
  'Email not configured. Ask your admin to set up SMTP in Settings.': 'email_not_configured',
  'No recipient. Fill in a From address (or make sure your account has an email set).': 'email_no_recipient',
  'SMTP test failed': 'smtp_test_failed',
  'SMTP is configured via environment variables and cannot be changed here.': 'smtp_env_locked',
  'AI is configured via environment variables and cannot be changed here.': 'ai_env_locked',
  'AI not configured on server. Set AI_API_KEY in environment.': 'ai_not_configured',

  // Notification services (Settings → Notifications)
  'Gotify URL and token required — save settings first': 'gotify_required_save',
  'Gotify URL and token required': 'gotify_required',
  'ntfy topic required': 'ntfy_topic_required',
  'Apprise URL required': 'apprise_url_required',

  // Backups
  'Backup schedule is locked by environment variable': 'backup_schedule_locked',
  'time must be HH:MM': 'backup_time_format',
  'time out of range': 'backup_time_format',
  'retention must be 1-99': 'backup_retention_range',

  // Files, imports, images
  'No file uploaded': 'no_file',
  'File is not a supported image (JPEG, PNG, WebP, GIF, HEIC, AVIF, BMP).': 'unsupported_image',
  'That address is not an image': 'not_an_image',
  'Could not reach that service': 'service_unreachable',
  'Unsupported source': 'unsupported_source',
  'No rows found in file': 'no_rows',
  'Empty file': 'empty_file',
  'No meal-nutrition CSV found in the ZIP — expected a file named "Nutritional Information.csv" or "Meal Level Nutrition Details.csv"': 'zip_no_meal_csv',
  'ZIP uploads are only supported for MyFitnessPal — please extract the CSV first': 'zip_mfp_only',
  'This Food & Recipe Entries export lists your foods but has no nutrition columns, which is how Cronometer now exports it on some accounts. Use Export Daily Nutrition instead, with "Include diary group rows" ticked, to bring your totals per meal.': 'cronometer_no_nutrition',
  'This Daily Nutrition export has no Energy (kcal) column, so there are no numbers to import.': 'cronometer_no_energy',
  'Does not look like a LoseIt food log export — expected Date + Name + Type + Calories columns': 'loseit_unrecognized',
  'Missing required columns: need Date, a name (Name/Food/Item), and energy (Calories/kcal/Energy)': 'spreadsheet_missing_columns',

  // Foods, meals, recipes, sharing
  'Name required': 'name_required',
  'name required': 'name_required',
  'Already yours': 'already_yours',
  'Invalid visibility': 'invalid_visibility',
  'visibility must be private, group, or specific': 'invalid_visibility',
  'Sharing is not enabled on this instance.': 'sharing_disabled',
  'Sharing is not enabled.': 'sharing_disabled',

  // Diary, activity, fasting
  'Invalid start/end date; expected YYYY-MM-DD.': 'invalid_date',
  'invalid date': 'invalid_date',
  'name and date required': 'activity_name_date_required',
  'A fast is already in progress. End it before starting a new one.': 'fast_in_progress',
  'A fast is already in progress.': 'fast_in_progress',
  'Food not found': 'food_not_found',
  'Meal not found': 'meal_not_found',
  'Fast not found': 'fast_not_found',
  'Fast is already ended': 'fast_already_ended',

  // Connected services and wearables
  'No Mealie URL configured. Set it in Settings → Connected Services first.': 'mealie_not_configured',
  'No CookTrace URL configured. Set it in Settings > Connected Services first.': 'cooktrace_not_configured',
  'Mealie URL must match the one saved in Settings.': 'mealie_url_mismatch',
  'CookTrace URL must match the one saved in Settings.': 'cooktrace_url_mismatch',
  'Could not reach Mealie': 'mealie_unreachable',
  'Could not reach CookTrace': 'cooktrace_unreachable',
  'CookTrace request failed': 'cooktrace_failed',
  'Garmin consumer key, secret, and redirect URI must be configured in Settings → Wellness.': 'garmin_not_configured',
  'Google Health not configured': 'google_health_not_configured',
  'Invalid date range': 'invalid_date_range',
  'Range cannot exceed 365 days': 'range_too_long',
  'Workout not found': 'workout_not_found',

  // API tokens, webhooks, outgoing URLs (admin settings)
  'API tokens require a signed-in account. Enable user management and sign in as an admin first.': 'api_tokens_need_account',
  'Webhooks require a signed-in account. Enable user management and sign in as an admin first.': 'webhooks_need_account',
  'url required': 'url_required',
  'At least one valid scope required': 'scope_required',
  'At least one valid event required': 'event_required',
  'Webhook not found': 'webhook_not_found',
  'Invalid URL': 'invalid_url',
  'Only http and https URLs are allowed': 'url_http_only',
  'Could not resolve host': 'host_unresolved',
  'Link-local / cloud-metadata addresses are not allowed': 'url_link_local',

  // Updates
  'Update checks are turned off by UPDATE_CHECK in the environment': 'update_checks_off',
  'GitHub API unreachable and no cached version.': 'github_unreachable',
}));

// zxcvbn feedback, which the server appends to "Password is too weak: …".
for (const group of ['warnings', 'suggestions']) {
  for (const [id, en] of Object.entries(ZXCVBN_FEEDBACK_EN[group])) {
    if (!EXACT.has(en)) EXACT.set(en, zxcvbnFeedbackKey(group, id));
  }
}

// Messages with a variable part: [pattern, key, (match) => values].
// A captured message that is itself a server error is localized too.
const PATTERNS = [
  [/^Too many requests\. Try again in (\d+)s\.$/, 'rate_limited', m => ({ seconds: m[1] })],
  [/^Password is too weak: (.+)$/s, 'password_too_weak', m => ({ tip: localizeError(m[1]) })],
  [/^An account with that email already exists \(username: (.+)\)\. They can sign in directly or use Forgot Password\.$/, 'email_exists_user', m => ({ username: m[1] })],
  [/^Your (.+) account matches an existing NutriTrace user\. Sign in the usual way once, then link this provider from Profile → Linked Accounts\. After that, SSO will sign you in directly\.$/, 'oidc_account_exists', m => ({ provider: m[1] })],
  [/^OIDC provider (.+) is disabled$/, 'oidc_provider_disabled', m => ({ provider: m[1] })],
  [/^Unsupported source: (.*)$/, 'unsupported_source', () => ({})],
  [/^Could not read ZIP: (.+)$/s, 'zip_unreadable', m => ({ error: m[1] })],
  [/^Parse failed: (.+)$/s, 'parse_failed', m => ({ error: localizeError(m[1]) })],
  [/^Import failed: (.+)$/s, 'import_failed', m => ({ error: localizeError(m[1]) })],
  [/^This doesn't look like a Cronometer export\. .* but found: (.*)\.$/s, 'cronometer_unrecognized', m => ({ found: m[1] })],
  [/^Does not look like a MyFitnessPal export — expected Date \+ Meal \+ Calories columns, got: \[(.*)\]$/s, 'mfp_unrecognized', m => ({ columns: m[1] })],
  [/^Backup contains too many image entries \(>(\d+)\)$/, 'backup_too_many_images', m => ({ max: m[1] })],
  [/^Refusing (?:unsafe path|path traversal) in backup: (.+)$/, 'backup_unsafe_path', m => ({ path: m[1] })],
  [/^Backup uncompressed size exceeds \d+ bytes \(zip-bomb defense\)$/, 'backup_too_large', () => ({})],
  [/^(Fitbit|Google Health|Withings) client_id and redirect_uri must be configured in Settings → Wellness\.$/, 'wearable_not_configured', m => ({ service: m[1] })],
  [/^(Mealie|CookTrace) returned (\d+)$/, 'service_status', m => ({ service: m[1], status: m[2] })],
  [/^Too many messages \(max (\d+)\)$/, 'ai_too_many_messages', m => ({ max: m[1] })],
  [/^Private \/ loopback addresses are blocked\. Set (\w+)=1 to enable LAN targets\.$/, 'url_private_blocked', m => ({ env: m[1] })],
  [/^API error (\d+)$/, 'api_error', m => ({ status: m[1] })],
];

function _key(k) { return k.includes('.') ? k : S + k; }

/**
 * The app-language text for a known server error message; anything else
 * (including null/undefined and non-strings) comes back unchanged.
 */
export function localizeError(msg) {
  if (typeof msg !== 'string' || !msg) return msg;
  const text = msg.trim();
  const key = EXACT.get(text);
  if (key) return t(_key(key), null, msg);
  for (const [re, k, values] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      const v = values(m);
      const out = t(_key(k), v);
      // svelte-i18n not ready (or key missing): keep the original text.
      return out && out !== _key(k) ? out : msg;
    }
  }
  return msg;
}
