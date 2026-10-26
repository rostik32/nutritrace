/**
 * In the browser and the installed PWA, back is a history step: it used to
 * leave the page under an open sheet instead of closing the sheet.
 * installHistoryBack() catches the step, puts the URL back and closes the
 * newest layer, like the Android back button does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

let n = 0;
// Each test gets its own module instance (the install is once per page).
const fresh = () => import(`../src/lib/back-stack.js?t=${n++}`);

const hashOf = (u) => u.slice(u.indexOf('#'));

/** Minimal window: history entries with state, popstate then hashchange. */
function fakeWindow(start = 'https://app/#/diary') {
  const on = { popstate: [], hashchange: [] };
  let entries = [{ href: start, state: null }];
  let i = 0;
  let exited = false;
  const fire = (type, e) => on[type].forEach((f) => f(e));
  const traverse = (step) => {
    if (i + step < 0) { exited = true; return; }
    const from = entries[i].href;
    i += step;
    fire('popstate', { state: entries[i].state });
    if (hashOf(from) !== hashOf(win.location.href)) fire('hashchange', {});
  };
  const win = {
    addEventListener: (type, f) => on[type].push(f),
    location: { get href() { return entries[i].href; } },
    history: {
      get state() { return entries[i].state; },
      pushState(state, _t, url) { entries = entries.slice(0, i + 1); entries.push({ href: url, state }); i++; },
      replaceState(state, _t, url) { entries[i] = { href: url ?? entries[i].href, state }; },
      back() { traverse(-1); },
      go(step) { traverse(step); },
    },
  };
  return {
    win,
    /** The phone's back button / gesture (not the app's own history.back). */
    userBack: () => traverse(-1),
    /** A router push: a new entry; the browser fires popstate and hashchange. */
    navigate(path) {
      entries = entries.slice(0, i + 1);
      entries.push({ href: `https://app/#${path}`, state: null });
      i++;
      fire('popstate', { state: null });
      fire('hashchange', {});
    },
    get route() { return hashOf(win.location.href); },
    get exited() { return exited; },
    get depth() { return entries.length; },
  };
}

test('with nothing open, back goes back a page as before', async () => {
  const { installHistoryBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  w.navigate('/foods');
  w.userBack();
  assert.equal(w.route, '#/diary');
});

test('back with a sheet open closes the sheet and stays on the page', async () => {
  const { installHistoryBack, closeOnBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  w.navigate('/foods');
  let closed = 0;
  const sheet = closeOnBack({}, () => closed++);
  w.userBack();
  assert.equal(closed, 1);
  assert.equal(w.route, '#/foods');
  sheet.destroy();
  w.userBack();
  assert.equal(w.route, '#/diary', 'the next back leaves the page');
});

test('nested layers close newest first, one per back', async () => {
  const { installHistoryBack, closeOnBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  w.navigate('/foods');
  const closed = [];
  let sheet, dialog;
  sheet = closeOnBack({}, () => { closed.push('sheet'); sheet.destroy(); });
  dialog = closeOnBack({}, () => { closed.push('dialog'); dialog.destroy(); });
  w.userBack();
  w.userBack();
  assert.deepEqual(closed, ['dialog', 'sheet']);
  assert.equal(w.route, '#/foods');
});

test("the app's own history.back() still navigates with a sheet open", async () => {
  // "Add to diary" from the portion sheet returns to the diary this way.
  const { installHistoryBack, closeOnBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  w.navigate('/foods');
  let closed = 0;
  closeOnBack({}, () => closed++);
  w.win.history.back();
  assert.equal(w.route, '#/diary');
  assert.equal(closed, 0);
});

test('a navigation from inside a sheet is not undone', async () => {
  // "Edit nutrition" opens the food editor while the card is still up.
  const { installHistoryBack, closeOnBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  let closed = 0;
  closeOnBack({}, () => closed++);
  w.navigate('/foods/edit/1');
  assert.equal(w.route, '#/foods/edit/1');
  assert.equal(closed, 0);
});

test('on the first page back closes a sheet instead of the app', async () => {
  const { installHistoryBack, closeOnBack } = await fresh();
  const w = fakeWindow();
  installHistoryBack({ win: w.win });
  let closed = 0;
  const sheet = closeOnBack({}, () => closed++);
  w.userBack();
  assert.equal(closed, 1);
  assert.equal(w.exited, false);
  sheet.destroy();
});

test('on the first page with nothing open, back warns once, then leaves', async () => {
  const { installHistoryBack } = await fresh();
  const w = fakeWindow();
  let hints = 0;
  installHistoryBack({ win: w.win, onExitHint: () => hints++ });
  w.userBack();
  assert.equal(hints, 1);
  assert.equal(w.exited, false);
  w.userBack();
  assert.equal(w.exited, true);
});

test('the slide-out sidebar closes before back leaves the page', async () => {
  const { installHistoryBack } = await fresh();
  const w = fakeWindow();
  let sidebarOpen = true;
  installHistoryBack({ win: w.win, closeOther: () => (sidebarOpen ? !(sidebarOpen = false) : false) });
  w.navigate('/foods');
  w.userBack();
  assert.equal(sidebarOpen, false);
  assert.equal(w.route, '#/foods');
  w.userBack();
  assert.equal(w.route, '#/diary');
});

test('a reload does not add another spare entry', async () => {
  const w = fakeWindow();
  (await fresh()).installHistoryBack({ win: w.win });
  const depth = w.depth;
  (await fresh()).installHistoryBack({ win: w.win });  // same history, new page load
  assert.equal(w.depth, depth);
});
