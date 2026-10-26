/**
 * back-stack.js: what Android's back button (or gesture) closes first.
 *
 * Sheets, dialogs and full-screen overlays register a handler while they're
 * open; back runs the most recent one instead of leaving the page underneath
 * (#226: back did nothing visible with Body Stats open, because it only knew
 * how to go back a page). With nothing registered, back goes back a page and
 * then offers to exit, as before.
 *
 * In markup, attach it to the element that exists only while the layer is
 * open, and pass the same close action as the layer's own close button:
 *
 *   <div class="sheet-backdrop" use:closeOnBack={close}>
 *
 * A layer that must be answered (the sync merge dialog) passes a no-op, so
 * back neither dismisses it nor navigates away underneath it.
 */
const stack = [];

/** Register `handler` for the next back press. Returns a release function. */
export function onBack(handler) {
  const entry = { handler };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * Run the topmost handler. True when something took the back press.
 *
 * The entry stays registered until its layer releases it (closeOnBack does
 * that when the element is removed), so a layer whose back action is a
 * deliberate no-op keeps catching back instead of letting the next press
 * navigate away underneath it.
 */
export function handleBack() {
  const entry = stack[stack.length - 1];
  if (!entry) return false;
  try { entry.handler(); } catch { /* the layer is gone either way */ }
  return true;
}

/** How many layers are waiting on back (for tests and diagnostics). */
export function backStackDepth() {
  return stack.length;
}

/**
 * Svelte action: register while the element is mounted, release when it's
 * removed (closed any other way, or the page changes).
 */
export function closeOnBack(node, handler) {
  let current = handler;
  const release = onBack(() => { if (typeof current === 'function') current(); });
  return {
    update(next) { current = next; },
    destroy: release,
  };
}

/**
 * Browser and installed-PWA back (the native app gets Capacitor's backButton
 * event instead, see App.svelte). There back is a history traversal that
 * cannot be cancelled, so it used to leave the page under an open sheet. Now,
 * when back lands while a layer is open, the URL is put back at once (before
 * the router's hashchange reads it, so the page stays mounted) and the layer
 * closes, as on Android.
 *
 * Every entry carries an index in history.state, which tells a step back from
 * a new navigation (router pushes fire popstate too). history.back()/go()
 * called by the app itself ("added to diary, return to the diary") are
 * navigation, not a back press, and pass through untouched.
 *
 * A fresh launch also gets one spare entry under the first page, so back on
 * the first page with a sheet open closes the sheet instead of the app; with
 * nothing open it shows `onExitHint` and a second back within 2 s leaves.
 * `closeOther` closes something that isn't on the stack (the slide-out
 * sidebar) and returns true if it did.
 */
const IDX = 'ntBackIdx';
const BASE = 'ntBackBase';
const EXIT_WINDOW_MS = 2000;
let historyInstalled = false;

export function installHistoryBack({ win = globalThis.window, onExitHint, closeOther } = {}) {
  if (!win || historyInstalled) return;
  historyInstalled = true;
  const h = win.history;
  const loc = win.location;
  const stamp = (state, idx, extra) => ({ ...(state || {}), [IDX]: idx, ...extra });

  let idx;
  if (typeof h.state?.[IDX] === 'number') {
    idx = h.state[IDX];                     // a reload: the stamps survive it
  } else {
    h.replaceState(stamp(h.state, 0, { [BASE]: true }), '', loc.href);
    h.pushState(stamp(null, 1), '', loc.href);
    idx = 1;
  }
  let href = loc.href;

  let programmaticUntil = 0;
  const back = h.back.bind(h);
  const go = h.go.bind(h);
  h.back = () => { programmaticUntil = Date.now() + 1000; back(); };
  h.go = (n) => { if (n) programmaticUntil = Date.now() + 1000; go(n); };

  // A new entry (router push, link) has no index yet.
  const adopt = () => {
    if (typeof h.state?.[IDX] === 'number') return false;
    idx += 1;
    h.replaceState(stamp(h.state, idx), '', loc.href);
    href = loc.href;
    return true;
  };

  let exitTimer = null;
  win.addEventListener('hashchange', () => { adopt(); href = loc.href; });
  win.addEventListener('popstate', (e) => {
    const prevHref = href;
    if (adopt()) return;
    const to = e.state[IDX];
    const wentBack = to < idx;
    idx = to;
    href = loc.href;
    if (!wentBack) return;
    if (Date.now() < programmaticUntil) { programmaticUntil = 0; return; }
    const other = !stack.length && typeof closeOther === 'function' && closeOther();
    if (stack.length || other) {
      // Undo the step, then close the layer.
      idx += 1;
      h.pushState(stamp(null, idx), '', prevHref);
      href = prevHref;
      handleBack();
      return;
    }
    if (e.state[BASE]) {
      if (typeof onExitHint === 'function') onExitHint();
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => {
        if (!h.state?.[BASE]) return;
        idx = 1;
        h.pushState(stamp(null, idx), '', loc.href);
        href = loc.href;
      }, EXIT_WINDOW_MS);
    }
  });
}
