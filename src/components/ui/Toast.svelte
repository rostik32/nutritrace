<script>
  import { fly, fade } from 'svelte/transition';
  import { toasts } from '../../stores/toast.js';
</script>

<div class="toast-container" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast toast--{toast.type}"
      in:fly={{ y: 20, duration: 240 }}
      out:fade={{ duration: 160 }}
    >
      {#if toast.type === 'success'}
        <span class="material-symbols-rounded toast-icon">check_circle</span>
      {:else if toast.type === 'error'}
        <span class="material-symbols-rounded toast-icon">error</span>
      {/if}
      <span class="toast-msg">{toast.message}</span>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: calc(var(--nav-h) + var(--safe-bottom) + 12px);
    /* Span the viewport with 16px gutters and centre toasts inside it
       (instead of left:50% + translate), so a long message can wrap
       across the full width rather than shrinking to half the screen. */
    left: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 200;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-radius: var(--radius-lg);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-1);
    max-width: 560px;
    overflow-wrap: anywhere;
    backdrop-filter: var(--backdrop-blur);
    -webkit-backdrop-filter: var(--backdrop-blur);
  }
  .toast--success { border-color: rgba(79,255,176,0.25); }
  .toast--error   { border-color: rgba(255,92,92,0.25); }
  .toast-icon { font-size: 18px; flex-shrink: 0; }
  .toast--success .toast-icon { color: var(--success); }
  .toast--error   .toast-icon { color: var(--danger); }
  .toast-msg { flex: 1; }
</style>
