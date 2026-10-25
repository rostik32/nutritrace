/**
 * food-search.js
 *
 * The Foods tab search pipeline: one query, one result list, several
 * sources. Plain JS (no Svelte, no DOM) so it can be unit-tested and reused
 * by other tabs later.
 *
 * Sources come in two tiers:
 *   tier 1 — the user's own foods, foods shared with them (both matched in
 *            memory) and Open Food Facts as answered by the server (mirror
 *            first, live OFF when the mirror has nothing);
 *   tier 2 — online databases (live OFF past the mirror, USDA, Mealie,
 *            CookTrace pantry).
 * Tier 1 runs on every search. Tier 2 runs on its own only when tier 1
 * found nothing at all, otherwise when the user asks (searchOnline()).
 *
 * The list only ever grows at the end: in-memory matches first, then the
 * first page of each paged source in source order, then further pages from
 * the first source that still has some. A product already listed (same
 * barcode, or same source + id) is not listed again by a later source.
 *
 * Source descriptor:
 *   { id, tier: 1|2, match(query) => items[] }              in memory
 *   { id, tier: 1|2, fetchPage(query, page) => { items, hasMore } }  paged
 */
import { foldText } from './search-text.js';

export const FOOD_SEARCH_SORTS = ['relevance', 'alpha', 'recent', 'most'];

// ── Own-food matching and ranking ─────────────────────────────────────────

function _editDist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/**
 * How well a food matches the query, lower is better; null when it does not
 * match. 0 name starts with the query, 1 a word of the name starts with it,
 * 2 the query (or every word of it) appears in name or brand, 3 every query
 * word is within one typo of a word (words of 4+ letters only).
 */
export function matchRank(food, query) {
  const q = foldText(query).trim();
  if (!q) return null;
  const name = foldText(food?.name);
  const brand = foldText(food?.brand);
  const combined = brand ? name + ' ' + brand : name;
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some(w => w.startsWith(q))) return 1;
  if (combined.includes(q)) return 2;
  const qWords = q.split(/\s+/).filter(Boolean);
  if (qWords.length > 1 && qWords.every(w => combined.includes(w))) return 2;
  const tWords = combined.split(/\s+/);
  const fuzzy = qWords.every(qw =>
    qw.length >= 4 && tWords.some(tw => tw.length >= 3 && _editDist(qw, tw) <= 1));
  return fuzzy ? 3 : null;
}

const _byName = (a, b) => (a.name || '').localeCompare(b.name || '');

/** Sort without matching. Same rules the Foods tab always used, plus relevance. */
export function sortFoods(list, sort, ranks) {
  const out = [...(list || [])];
  if (sort === 'recent') {
    out.sort((a, b) => {
      const al = a.last_used_at || '', bl = b.last_used_at || '';
      if (al && bl && al !== bl) return bl.localeCompare(al);
      if (al && !bl) return -1;
      if (bl && !al) return 1;
      return _byName(a, b);
    });
  } else if (sort === 'most') {
    out.sort((a, b) => ((b.usage_count || 0) - (a.usage_count || 0)) || _byName(a, b));
  } else if (sort === 'relevance' && ranks) {
    out.sort((a, b) =>
      ((b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))
      || (ranks.get(a) - ranks.get(b))
      || ((b.usage_count || 0) - (a.usage_count || 0))
      || _byName(a, b));
  } else {
    out.sort(_byName);
  }
  return out;
}

/** Foods from `list` that match `query`, in the requested order. */
export function rankFoods(list, query, sort = 'relevance') {
  const ranks = new Map();
  for (const f of list || []) {
    const r = matchRank(f, query);
    if (r !== null) ranks.set(f, r);
  }
  return sortFoods([...ranks.keys()], sort, ranks);
}

// ── Row identity ─────────────────────────────────────────────────────────

/** Barcodes differ in leading zeros between scanners and databases. */
function _normBarcode(b) {
  return String(b ?? '').trim().replace(/^0+/, '');
}

/** Dedupe key: the barcode when there is one, else source + id. */
export function rowKey(source, item) {
  const bc = _normBarcode(item?.barcode);
  if (bc) return 'bc:' + bc;
  const id = item?.id ?? item?.slug ?? item?.source_external_id ?? item?.name ?? '';
  return source + ':' + id;
}

// ── Barcode scan ─────────────────────────────────────────────────────────

/** First food in `list` with this barcode, leading zeros aside. */
export function foodWithBarcode(list, code) {
  const n = _normBarcode(code);
  if (!n) return null;
  return (list || []).find(f => _normBarcode(f?.barcode) === n) || null;
}

/**
 * Look a scanned barcode up the way the search looks up a name: the steps
 * are given in the search's source order (own foods, shared foods, Open
 * Food Facts as the server answers it, then the online databases) and the
 * first one that knows the code wins, so nothing online is asked while
 * something nearer has the product. A step that fails counts as a miss.
 *
 * @param {string} code
 * @param {{ id: string, find: (code: string) => any }[]} steps
 * @returns {Promise<{ source: string, item: object } | null>}
 */
export async function findBarcode(code, steps) {
  for (const s of steps || []) {
    let item = null;
    try { item = await s.find(code); } catch { item = null; }
    if (item) return { source: s.id, item };
  }
  return null;
}

// ── Row actions ──────────────────────────────────────────────────────────

/**
 * A product found in an online database (OFF, USDA) rather than one of the
 * user's or a shared food or an import from Mealie / CookTrace. Editing it
 * saves a copy to My Foods.
 */
export function isDatabaseFood(item) {
  if (!item || typeof item.id === 'number' || item._shared_by != null || item.source_app) return false;
  return item._source === 'usda' || !!String(item.barcode ?? '').trim();
}

/**
 * What the long-press menu offers for a food row, as action values:
 *   'copy'      shared food → save it to the user's catalog
 *   'edit'      open the editor (own food: in place; database product:
 *               saves an edited copy; in pick mode also adds to the meal)
 *   'save'      database product → save to My Foods as is
 *   'clone', 'select', 'delete'   own food management
 * A database product is anything without a numeric id (OFF, USDA).
 */
export function foodItemActions(item, { pickMode = false, foodsTab = true } = {}) {
  if (!item) return [];
  if (item._shared_by != null) return ['copy'];
  if (typeof item.id !== 'number') return foodsTab ? ['edit', 'save'] : ['save'];
  // Pick mode owns multi-select, so "Select Multiple" would do nothing there.
  return ['edit', ...(foodsTab ? [] : ['clone']), ...(pickMode ? [] : ['select']), 'delete'];
}

// ── The pipeline ─────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {(state) => void} [opts.onChange] called after every state change
 * @param {number} [opts.debounceMs] delay before the first paged requests
 */
export function createFoodSearch({ onChange = () => {}, debounceMs = 400 } = {}) {
  let gen = 0;
  let timer = null;
  let query = '';
  let sources = [];
  // Per paged source: { page, hasMore, started }
  let paging = new Map();
  let memoryRows = [];
  let pagedRows = [];
  let seen = new Map();
  let inFlight = false;

  const state = {
    query: '',
    rows: [],
    loading: false,       // tier 1 (or automatic tier 2) first pages pending
    loadingMore: false,   // a further page pending
    onlineLoading: false, // tier 2 first pages pending
    onlineAvailable: false,
    onlineDone: false,
    settled: true,        // nothing pending for the current query
    hasMore: false,
  };

  function emit() {
    state.rows = [...memoryRows, ...pagedRows];
    state.hasMore = [...paging.values()].some(p => p.started && p.hasMore);
    state.settled = !state.loading && !state.loadingMore && !state.onlineLoading;
    onChange({ ...state });
  }

  // In-memory matches. Two own foods may share a barcode and both stay; a
  // shared food with the barcode of an own food does not. Row keys stay
  // unique (the second of two such foods gets a suffix), so the list can be
  // keyed by them and keep a row's DOM while the user types.
  function _memory() {
    memoryRows = [];
    const keys = new Map();
    const repeats = new Map();
    for (const s of sources) {
      if (!s.match) continue;
      for (const item of s.match(query) || []) {
        const key = rowKey(s.id, item);
        const owner = keys.get(key);
        if (owner !== undefined && owner !== s.id) continue;
        keys.set(key, s.id);
        const n = repeats.get(key) || 0;
        repeats.set(key, n + 1);
        memoryRows.push({ source: s.id, item, key: n ? key + '#' + n : key });
      }
    }
    return keys;
  }

  function _append(sourceId, items) {
    for (const item of items || []) {
      const key = rowKey(sourceId, item);
      if (seen.has(key)) continue;
      seen.set(key, sourceId);
      pagedRows.push({ source: sourceId, item, key });
    }
  }

  // First page of every paged source of a tier, in parallel, appended in
  // source order once all have answered so the order never depends on
  // which server was faster.
  async function _runTier(tier, myGen) {
    const tierSources = sources.filter(s => s.fetchPage && s.tier === tier);
    const results = await Promise.all(tierSources.map(s =>
      Promise.resolve()
        .then(() => s.fetchPage(query, 1))
        .catch(() => null)));
    if (myGen !== gen) return false;
    tierSources.forEach((s, i) => {
      const r = results[i];
      paging.set(s.id, { page: 1, hasMore: !!r?.hasMore, started: true });
      _append(s.id, r?.items);
    });
    return true;
  }

  async function _tier1(myGen) {
    state.loading = true;
    emit();
    const ok = await _runTier(1, myGen);
    if (!ok) return;
    // Nothing anywhere in tier 1 → go online on our own.
    if (memoryRows.length === 0 && pagedRows.length === 0 && state.onlineAvailable) {
      state.onlineDone = true;
      const ok2 = await _runTier(2, myGen);
      if (!ok2) return;
    }
    state.loading = false;
    emit();
  }

  function start(q, nextSources) {
    gen++;
    clearTimeout(timer);
    query = String(q ?? '').trim();
    sources = nextSources || [];
    paging = new Map();
    pagedRows = [];
    inFlight = false;
    state.query = query;
    state.loading = false;
    state.loadingMore = false;
    state.onlineLoading = false;
    state.onlineDone = false;
    state.onlineAvailable = !!query && sources.some(s => s.tier === 2 && s.fetchPage);
    if (!query) {
      memoryRows = [];
      seen = new Map();
      emit();
      return;
    }
    seen = _memory();
    const hasPaged1 = sources.some(s => s.fetchPage && s.tier === 1);
    if (!hasPaged1 && memoryRows.length > 0) {
      emit();
      return;
    }
    const myGen = gen;
    state.loading = true;
    emit();
    timer = setTimeout(() => { _tier1(myGen); }, debounceMs);
  }

  /** Run tier 2 for the current query (the "Search online databases" button). */
  async function searchOnline() {
    if (!query || state.onlineDone || !state.onlineAvailable) return;
    const myGen = gen;
    state.onlineDone = true;
    state.onlineLoading = true;
    emit();
    const ok = await _runTier(2, myGen);
    if (!ok) return;
    state.onlineLoading = false;
    emit();
  }

  /** Next page of the first source (in source order) that still has pages. */
  async function loadMore() {
    if (inFlight || state.loading || state.onlineLoading || !query) return;
    const s = sources.find(src => src.fetchPage && paging.get(src.id)?.started && paging.get(src.id).hasMore);
    if (!s) return;
    const myGen = gen;
    const p = paging.get(s.id);
    inFlight = true;
    state.loadingMore = true;
    emit();
    let r = null;
    try { r = await s.fetchPage(query, p.page + 1); } catch { r = null; }
    if (myGen !== gen) return;
    inFlight = false;
    // A failed page ends that source rather than retrying forever.
    paging.set(s.id, { page: p.page + 1, hasMore: !!r?.hasMore, started: true });
    _append(s.id, r?.items);
    state.loadingMore = false;
    emit();
  }

  /**
   * Re-match the in-memory sources (own catalog reloaded, sort changed)
   * without refetching pages. Paged rows that now duplicate an own food are
   * dropped.
   */
  function refreshMemory(nextSources) {
    if (nextSources) {
      const byId = new Map(nextSources.map(s => [s.id, s]));
      sources = sources.map(s => (s.match && byId.get(s.id)?.match) ? byId.get(s.id) : s);
    }
    if (!query) return;
    const keys = _memory();
    pagedRows = pagedRows.filter(r => !keys.has(r.key));
    seen = new Map(keys);
    for (const r of pagedRows) seen.set(r.key, r.source);
    emit();
  }

  function destroy() {
    gen++;
    clearTimeout(timer);
  }

  return { start, searchOnline, loadMore, refreshMemory, destroy, get state() { return { ...state }; } };
}
