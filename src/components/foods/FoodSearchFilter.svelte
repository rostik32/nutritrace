<!--
  FoodSearchFilter — what the Foods search includes and how it is ordered.

  Rendered in a Sheet on phones (from the filter button next to the search
  box) and inline in the Foods page's left rail on wide screens. Stateless:
  the page owns the values and applies each event, so the same component
  can serve the Meals / Recipes tabs later with a different source list.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';

  export let sources = [];          // [{ id, label }] that can be searched
  export let excluded = [];         // source ids the user left out
  export let sort = 'relevance';
  export let sortValues = null;     // the sort orders to offer; null = all
  export let showOffTiers = false;
  export let offTiers = new Set();  // active OFF completeness buckets
  export let showUsdaTiers = false;
  export let usdaTiers = new Set(); // active USDA data types
  export let categories = [];       // [{ value, label }]
  export let category = '';         // '' = all
  export let canReset = false;

  const dispatch = createEventDispatcher();

  const SORTS = [
    { value: 'relevance', key: 'settings_foods_picker.opt_relevance' },
    { value: 'alpha',     key: 'settings_foods_picker.opt_alpha' },
    { value: 'recent',    key: 'settings_foods_picker.opt_recent' },
    { value: 'most',      key: 'settings_foods_picker.opt_most' },
  ];
  const OFF_TIERS = [
    { value: 'hi',      swatch: 'tier-swatch-hi',  label: 'foods.tier.off_high',    hint: 'foods.tier.off_high_hint' },
    { value: 'mid',     swatch: 'tier-swatch-mid', label: 'foods.tier.off_medium',  hint: 'foods.tier.off_medium_hint' },
    { value: 'lo',      swatch: 'tier-swatch-lo',  label: 'foods.tier.off_low',     hint: 'foods.tier.off_low_hint' },
    { value: 'unknown', swatch: '',                label: 'foods.tier.off_unknown', hint: 'foods.tier.off_unknown_hint' },
  ];
  const USDA_TIERS = [
    { value: 'Foundation',     swatch: 'tier-swatch-hi',  label: 'foods.tier.usda_foundation',   hint: 'foods.tier.usda_foundation_hint' },
    { value: 'SR Legacy',      swatch: 'tier-swatch-hi',  label: 'foods.tier.usda_sr_legacy',    hint: 'foods.tier.usda_sr_legacy_hint' },
    { value: 'Survey (FNDDS)', swatch: 'tier-swatch-mid', label: 'foods.tier.usda_survey',       hint: 'foods.tier.usda_survey_hint' },
    { value: 'Branded',        swatch: 'tier-swatch-lo',  label: 'foods.tier.usda_branded',      hint: 'foods.tier.usda_branded_hint' },
    { value: 'Experimental',   swatch: 'tier-swatch-lo',  label: 'foods.tier.usda_experimental', hint: 'foods.tier.usda_experimental_hint' },
  ];

  $: _excluded = new Set(excluded || []);
</script>

<div class="fsf">
  {#if sources.length > 1}
    <section class="fsf-section">
      <p class="fsf-heading">{$_('foods.search.filter_sources')}</p>
      {#each sources as src (src.id)}
        <label class="tier-option">
          <input type="checkbox" checked={!_excluded.has(src.id)}
            on:change={() => dispatch('source', { id: src.id })} />
          <span class="tier-label">{src.label}</span>
        </label>
      {/each}
    </section>
  {/if}

  <section class="fsf-section">
    <p class="fsf-heading">{$_('foods.search.filter_sort')}</p>
    {#each SORTS.filter(s => !sortValues || sortValues.includes(s.value)) as s (s.value)}
      <label class="tier-option">
        <input type="radio" name="fsf-sort" checked={sort === s.value}
          on:change={() => dispatch('sort', { value: s.value })} />
        <span class="tier-label">{$_(s.key)}</span>
      </label>
    {/each}
    <p class="fsf-note">{$_('foods.search.filter_sort_note')}</p>
  </section>

  {#if categories.length > 0}
    <section class="fsf-section">
      <p class="fsf-heading">{$_('foods.search.filter_category')}</p>
      <div class="fsf-chips">
        <button type="button" class="fsf-chip" class:active={!category}
          on:click={() => dispatch('category', { value: '' })}>{$_('foods.category_all')}</button>
        {#each categories as c (c.value)}
          <button type="button" class="fsf-chip" class:active={category === c.value}
            on:click={() => dispatch('category', { value: category === c.value ? '' : c.value })}>{c.label}</button>
        {/each}
      </div>
    </section>
  {/if}

  {#if showOffTiers}
    <section class="fsf-section">
      <p class="fsf-heading">{$_('foods.tier.off_data_quality')}</p>
      {#each OFF_TIERS as t (t.value)}
        <label class="tier-option">
          <input type="checkbox" checked={offTiers.has(t.value)}
            on:change={() => dispatch('offtier', { tier: t.value })} />
          <span class="tier-swatch {t.swatch}"></span>
          <span class="tier-label">{$_(t.label)} <span class="tier-hint">{$_(t.hint)}</span></span>
        </label>
      {/each}
    </section>
  {/if}

  {#if showUsdaTiers}
    <section class="fsf-section">
      <p class="fsf-heading">{$_('foods.tier.usda_data_type')}</p>
      {#each USDA_TIERS as t (t.value)}
        <label class="tier-option">
          <input type="checkbox" checked={usdaTiers.has(t.value)}
            on:change={() => dispatch('usdatier', { tier: t.value })} />
          <span class="tier-swatch {t.swatch}"></span>
          <span class="tier-label">{$_(t.label)} <span class="tier-hint">{$_(t.hint)}</span></span>
        </label>
      {/each}
    </section>
  {/if}

  {#if canReset}
    <button type="button" class="btn btn-secondary fsf-reset" on:click={() => dispatch('reset')}>
      <span class="material-symbols-rounded">filter_alt_off</span>
      {$_('foods.search.filter_reset')}
    </button>
  {/if}
</div>

<style>
  .fsf { display: flex; flex-direction: column; gap: 14px; padding-bottom: 8px; }
  .fsf-section { display: flex; flex-direction: column; gap: 2px; }
  .fsf-heading {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-3);
    margin: 0 0 4px 8px;
  }
  .fsf-note { font-size: 12px; color: var(--text-3); margin: 2px 8px 0; }
  .fsf-section input[type="radio"] { margin: 0; flex-shrink: 0; accent-color: var(--accent); }
  .fsf-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 8px; }
  .fsf-chip {
    padding: 5px 12px;
    border-radius: var(--radius-full);
    border: 1.5px solid var(--border);
    background: none;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-2);
  }
  .fsf-chip.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); font-weight: 600; }
  .fsf-reset { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; }
  .fsf-reset .material-symbols-rounded { font-size: 18px; }
</style>
