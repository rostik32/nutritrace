import { writable } from 'svelte/store';
import { t } from '../lib/i18n-t.js';

/** Global confirm-dialog store.
 *
 *  Usage from any component:
 *    import { confirmDialog } from '../../stores/confirmDialog.js';
 *    if (!await confirmDialog({ title: 'Delete?', message: '...', dangerous: true })) return;
 *
 *  A single <ConfirmDialogMount /> instance (mounted in App.svelte) renders
 *  the Dialog and resolves the awaiting promise on user action.
 */

export const confirmRequest = writable(null);

// Defaults are resolved per call, so they follow the current app language.
export function confirmDialog({
  title = t('common.are_you_sure', null, 'Are you sure?'),
  message = '',
  confirmText = t('common.ok', null, 'OK'),
  cancelText = t('common.cancel', null, 'Cancel'),
  dangerous = false,
} = {}) {
  return new Promise(resolve => {
    confirmRequest.set({ title, message, confirmText, cancelText, dangerous, resolve });
  });
}
