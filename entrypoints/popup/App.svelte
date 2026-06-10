<script lang="ts">
  import { onMount } from 'svelte';
  import type { CaptureData, PickedElement } from '@/utils/types';
  import { FREE_PICKS_PER_DAY } from '@/utils/types';
  import { groupErrors } from '@/utils/report';
  import { EXPORT_TARGETS, buildExport } from '@/utils/export-targets';
  import { LICENSE_STORAGE_KEY, isProKey, normalizeKey } from '@/utils/license';
  import { isTracker } from '@/utils/trackers';

  type ViewState = 'loading' | 'ready' | 'unavailable';

  let view: ViewState = $state('loading');
  let data = $state<CaptureData | null>(null);
  let picked = $state<PickedElement | null>(null);
  let expectation = $state('');
  let copyState: 'idle' | 'busy' | 'done' = $state('idle');
  let photoState: 'idle' | 'done' = $state('idle');
  let redactedCount = $state(0);
  let picksUsedToday = $state(0);
  let activeTab: 'report' | 'problems' = $state('report');
  let targetId = $state('claude');
  let menuOpen = $state(false);
  let pro = $state(false);
  let licenseOpen = $state(false);
  let licenseInput = $state('');
  let licenseError = $state(false);

  let tabId: number | undefined;

  const target = $derived(EXPORT_TARGETS.find((t) => t.id === targetId) ?? EXPORT_TARGETS[0]);
  const picksLeft = $derived(pro ? 999 : Math.max(0, FREE_PICKS_PER_DAY - picksUsedToday));
  const errorCount = $derived(data?.errors.length ?? 0);
  const groupedErrors = $derived(groupErrors(data?.errors ?? []));
  const failures = $derived((data?.network ?? []).filter((n) => !isTracker(n.url)));
  const trackers = $derived((data?.network ?? []).filter((n) => isTracker(n.url)));
  const problemCount = $derived(errorCount + failures.length);
  const todayKey = () => `picks_${new Date().toISOString().slice(0, 10)}`;

  onMount(async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
      if (tabId == null) throw new Error('no tab');

      data = (await browser.tabs.sendMessage(tabId, { type: 'cg:getData' })) as CaptureData;

      const stored = await browser.storage.session.get(`picked_${tabId}`);
      picked = (stored[`picked_${tabId}`] as PickedElement) ?? null;

      const usage = await browser.storage.local.get(todayKey());
      picksUsedToday = (usage[todayKey()] as number) ?? 0;

      const prefs = await browser.storage.local.get(['cg:target', LICENSE_STORAGE_KEY]);
      pro = isProKey(prefs[LICENSE_STORAGE_KEY]);
      const saved = prefs['cg:target'];
      if (
        typeof saved === 'string' &&
        EXPORT_TARGETS.some((t) => t.id === saved && (!t.pro || pro))
      ) {
        targetId = saved;
      } else {
        // No saved choice: if an AI tool is open in another tab, default to it.
        try {
          const tabs = await browser.tabs.query({ currentWindow: true });
          for (const t of EXPORT_TARGETS) {
            if (!t.hostPattern || (t.pro && !pro)) continue;
            const open = tabs.some((tb) => {
              try {
                return t.hostPattern!.test(new URL(tb.url ?? '').host);
              } catch {
                return false;
              }
            });
            if (open) {
              targetId = t.id;
              break;
            }
          }
        } catch {
          /* tab detection is optional */
        }
      }

      view = 'ready';
    } catch {
      // chrome:// pages, the Web Store, sandboxed frames etc.
      view = 'unavailable';
    }
  });

  function selectTarget(id: string) {
    const t = EXPORT_TARGETS.find((x) => x.id === id);
    menuOpen = false;
    if (!t) return;
    if (t.pro && !pro) {
      licenseOpen = true;
      return;
    }
    targetId = id;
    browser.storage.local.set({ 'cg:target': id }).catch(() => {});
  }

  function unlockPro() {
    const key = normalizeKey(licenseInput);
    if (isProKey(key)) {
      pro = true;
      licenseError = false;
      licenseOpen = false;
      browser.storage.local.set({ [LICENSE_STORAGE_KEY]: key }).catch(() => {});
    } else {
      licenseError = true;
    }
  }

  function downloadMd() {
    if (!pro) {
      licenseOpen = true;
      menuOpen = false;
      return;
    }
    if (!data) return;
    const report = buildExport(targetId, { data, picked, expectation, pro });
    const blob = new Blob([report.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'debug-context.md';
    a.click();
    URL.revokeObjectURL(url);
    menuOpen = false;
  }

  function openTargetSite() {
    if (target.openUrl) browser.tabs.create({ url: target.openUrl }).catch(() => {});
  }

  async function captureScreenshot(): Promise<Blob | null> {
    try {
      const dataUrl = await browser.tabs.captureVisibleTab({ format: 'png' });
      return await (await fetch(dataUrl)).blob();
    } catch {
      return null;
    }
  }

  async function copyReport() {
    if (!data || copyState === 'busy') return;
    copyState = 'busy';
    // The text IS the report. (Chat inputs that receive text and image in a
    // single clipboard write keep only the image – so no combined writes.)
    const report = buildExport(targetId, { data, picked, expectation, pro });
    redactedCount = report.redactedCount;
    let ok = true;
    try {
      await navigator.clipboard.writeText(report.text);
    } catch {
      ok = false;
    }
    copyState = ok ? 'done' : 'idle';
    if (ok) setTimeout(() => (copyState = 'idle'), 2600);
  }

  async function copyPhoto() {
    const shot = await captureScreenshot();
    if (!shot) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': shot })]);
      photoState = 'done';
      setTimeout(() => (photoState = 'idle'), 2600);
    } catch {
      photoState = 'idle';
    }
  }

  async function startPick() {
    if (tabId == null || picksLeft <= 0) return;
    if (!pro) {
      picksUsedToday += 1;
      await browser.storage.local.set({ [todayKey()]: picksUsedToday });
    }
    await browser.tabs.sendMessage(tabId, { type: 'cg:startPick' });
    window.close();
  }

  async function clearPicked() {
    picked = null;
    if (tabId != null) await browser.storage.session.remove(`picked_${tabId}`);
  }

  function pageHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  function shortUrl(url: string | undefined): string {
    if (!url) return '(unknown url)';
    try {
      const u = new URL(url);
      return u.host + u.pathname;
    } catch {
      return url;
    }
  }

  const PRO_FEATURES = [
    'See what the server answered on every failed request',
    'Formats for Claude Code, Cursor, Gemini, Grok & GitHub',
    'Client-ready summary in plain English',
    'Unlimited element picker & report download',
  ];
</script>

{#snippet sectionLabel(text: string)}
  <p class="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
    {text}
  </p>
{/snippet}

<main class="w-[360px] font-sans text-[13px] leading-normal antialiased">
  <!-- Header -->
  <header class="flex items-center gap-2.5 px-5 pt-4 pb-3.5">
    <span class="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-accent-soft">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
        <path d="M13 2 4.5 13.5h6L10 22l8.5-11.5h-6L13 2Z" fill="currentColor" />
      </svg>
    </span>
    <h1 class="text-[13px] font-semibold tracking-[-0.01em]">Context Grabber</h1>
    <span
      class="ml-auto flex items-center gap-1.5 rounded-full border border-line px-2 py-[3px] text-[10px] font-medium text-ink-2"
      title="Everything stays on your computer. Nothing is sent anywhere."
    >
      <span class="h-[5px] w-[5px] rounded-full bg-ok"></span>
      Private
    </span>
  </header>

  {#if view === 'loading'}
    <div class="flex flex-col items-center gap-2.5 px-5 py-16">
      <div class="h-4 w-4 animate-spin rounded-full border-[1.5px] border-line-strong border-t-transparent"></div>
      <p class="text-[12px] text-ink-3">Checking this page…</p>
    </div>
  {:else if view === 'unavailable'}
    <div class="flex flex-col items-center px-6 py-14 text-center">
      <span class="mb-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" class="text-ink-3" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
          <path d="M5.5 5.5l13 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </span>
      <p class="text-[13.5px] font-medium">This page is off-limits</p>
      <p class="mt-1.5 max-w-[250px] text-[12.5px] leading-relaxed text-ink-2">
        Chrome doesn't let extensions look at its own pages. Switch to the app
        you're building and click the icon again.
      </p>
    </div>
  {:else if data}
    <div class="flex flex-col gap-3 px-5 pb-4">
      <!-- Status hero -->
      <div class="flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
        {#if problemCount > 0}
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" class="text-danger" aria-hidden="true">
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="min-w-0">
            <p class="text-[14.5px] font-semibold tracking-[-0.01em]">
              {problemCount} {problemCount === 1 ? 'problem' : 'problems'} found
            </p>
            <p class="mt-px truncate text-[11.5px] text-ink-2">
              on {pageHost(data.page.url)} — all captured for you
            </p>
          </div>
        {:else}
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" class="text-ok" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="min-w-0">
            <p class="text-[14.5px] font-semibold tracking-[-0.01em]">All clear</p>
            <p class="mt-px truncate text-[11.5px] text-ink-2">
              {#if trackers.length > 0}
                only blocked ad-trackers on {pageHost(data.page.url)} — harmless
              {:else}
                no errors on {pageHost(data.page.url)} right now
              {/if}
            </p>
          </div>
        {/if}
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 rounded-[10px] bg-surface-2 p-1">
        <button
          class="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition-colors {activeTab === 'report'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-ink-3 hover:text-ink-2'}"
          onclick={() => (activeTab = 'report')}
        >
          Report
        </button>
        <button
          class="flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition-colors {activeTab === 'problems'
            ? 'bg-surface text-ink shadow-sm'
            : 'text-ink-3 hover:text-ink-2'}"
          onclick={() => (activeTab = 'problems')}
        >
          Problems
          {#if problemCount > 0}
            <span class="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-danger px-1 font-mono text-[9px] font-semibold text-white">
              {problemCount}
            </span>
          {/if}
        </button>
      </div>

      {#if activeTab === 'problems'}
        <!-- Problems tab -->
        <div class="overflow-hidden rounded-xl border border-line bg-surface">
          {#if problemCount === 0 && trackers.length === 0}
            <p class="px-4 py-6 text-center text-[12px] text-ink-3">
              Nothing wrong on this page right now.
            </p>
          {:else}
            <div class="max-h-[260px] overflow-y-auto pb-1.5">
              {#if errorCount > 0}
                {@render sectionLabel(`Console errors · ${errorCount}`)}
                {#each groupedErrors as err}
                  <div class="flex items-start gap-2 px-4 py-1.5">
                    <span class="mt-[1px] shrink-0 rounded bg-danger-soft px-1.5 py-px font-mono text-[9.5px] font-medium text-danger">
                      {err.level}
                    </span>
                    <p class="min-w-0 font-mono text-[11px] leading-[1.5] break-words text-ink-2">
                      {err.message.slice(0, 200)}
                    </p>
                    {#if err.count > 1}
                      <span class="mt-[1px] ml-auto shrink-0 rounded bg-surface-2 px-1.5 py-px font-mono text-[9.5px] font-medium text-ink-3">
                        ×{err.count}
                      </span>
                    {/if}
                  </div>
                {/each}
              {/if}
              {#if failures.length > 0}
                {@render sectionLabel(`Failed connections · ${failures.length}`)}
                {#each failures as req}
                  <div class="flex items-start gap-2 px-4 py-1.5">
                    <span class="mt-[1px] shrink-0 rounded bg-danger-soft px-1.5 py-px font-mono text-[9.5px] font-medium text-danger">
                      {req.status === 0 ? 'failed' : req.status}
                    </span>
                    <p class="min-w-0 truncate font-mono text-[11px] leading-[1.5] text-ink-2" title={req.url}>
                      {req.method} {shortUrl(req.url)}
                    </p>
                  </div>
                {/each}
              {/if}
              {#if trackers.length > 0}
                {@render sectionLabel(`Blocked ad-trackers · ${trackers.length} — harmless`)}
                {#each trackers as req}
                  <div class="flex items-start gap-2 px-4 py-1.5 opacity-60">
                    <span class="mt-[1px] shrink-0 rounded bg-surface-2 px-1.5 py-px font-mono text-[9.5px] font-medium text-ink-3">
                      blocked
                    </span>
                    <p class="min-w-0 truncate font-mono text-[11px] leading-[1.5] text-ink-3" title={req.url}>
                      {shortUrl(req.url)}
                    </p>
                  </div>
                {/each}
                <p class="px-4 pt-1.5 pb-2 text-[10.5px] leading-relaxed text-ink-3">
                  Ad and analytics requests, usually blocked by an ad blocker.
                  They don't break your app.
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Report tab -->
        {#if picked}
          <div class="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="shrink-0 text-accent" aria-hidden="true">
              <path d="M4 4l7.5 16 2-6.5L20 11.5 4 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            </svg>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-medium">Element added to report</p>
              <p class="truncate font-mono text-[10.5px] text-ink-3">{picked.selector}</p>
            </div>
            <button
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              onclick={clearPicked}
              title="Remove from report"
              aria-label="Remove element from report"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        {/if}

        <textarea
          bind:value={expectation}
          rows="2"
          placeholder="What did you want to happen? (optional)"
          class="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed transition-colors placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none"
        ></textarea>

      {/if}

      <!-- Primary action (always visible) -->
      <div class="relative flex flex-col gap-1.5">
        <div class="flex overflow-hidden rounded-xl">
          <button
            onclick={copyReport}
            disabled={copyState === 'busy'}
            class="flex h-10 flex-1 items-center justify-center gap-2 bg-accent text-[13.5px] font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {#if copyState === 'done'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Copied!
            {:else if copyState === 'busy'}
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white"></span>
              One moment…
            {:else}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" />
              </svg>
              Copy for {target.label}
            {/if}
          </button>
          <button
            onclick={() => (menuOpen = !menuOpen)}
            class="flex h-10 w-9 items-center justify-center border-l border-white/20 bg-accent text-white transition-all hover:brightness-110"
            title="Choose where the report goes"
            aria-label="Choose export format"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="transition-transform {menuOpen ? 'rotate-180' : ''}" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        {#if menuOpen}
          <div class="absolute top-[44px] right-0 left-0 z-20 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {#each EXPORT_TARGETS as t}
              <button
                onclick={() => selectTarget(t.id)}
                class="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-medium transition-colors hover:bg-surface-2 {t.id === targetId ? 'text-accent' : 'text-ink-2'}"
              >
                {t.label}
                {#if t.id === targetId}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
                {#if t.pro && !pro}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="ml-auto text-ink-3" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" />
                  </svg>
                {/if}
              </button>
            {/each}
            <div class="border-t border-line"></div>
            <button
              onclick={downloadMd}
              class="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Download debug-context.md
              {#if !pro}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="ml-auto text-ink-3" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" />
                  <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" />
                </svg>
              {/if}
            </button>
          </div>
        {/if}

        <p class="text-center text-[11px] leading-relaxed text-ink-3">
          {#if copyState === 'done'}
            Now paste it into {target.label}
            {#if target.openUrl}
              · <button class="font-medium text-accent hover:underline" onclick={openTargetSite}>open {target.label} →</button>
            {/if}
            {#if redactedCount > 0}
              · {redactedCount} {redactedCount === 1 ? 'secret' : 'secrets'} hidden
            {/if}
          {:else}
            Formatted for {target.label} — paste it there when copied.
          {/if}
        </p>
      </div>

      {#if activeTab === 'report'}
        <!-- Secondary actions -->
        <div class="grid grid-cols-2 gap-2">
          <button
            onclick={startPick}
            disabled={picksLeft <= 0}
            class="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[12px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            title="Click a button or box on the page that looks wrong – it gets added to the report"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            Point at the bug
            {#if !pro}
              <span class="font-mono text-[10px] text-ink-3">{picksLeft}/{FREE_PICKS_PER_DAY}</span>
            {/if}
          </button>
          <button
            onclick={copyPhoto}
            class="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[12px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            title="Copies a picture of the page – useful for visual bugs. Paste it as a second message after the report."
          >
            {#if photoState === 'done'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="text-ok" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Photo copied
            {:else}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" />
                <circle cx="9" cy="11" r="2" stroke="currentColor" stroke-width="2" />
                <path d="m21 15-4-4-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Copy photo
            {/if}
          </button>
        </div>
        {#if photoState === 'done'}
          <p class="-mt-1.5 text-center text-[10.5px] text-ink-3">
            Paste it as a second message after the report
          </p>
        {/if}

        <!-- Pro -->
        <div class="rounded-xl border border-line bg-surface-2">
          <div class="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="text-ink-3" aria-hidden="true">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" />
            </svg>
            <p class="text-[10.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">Pro</p>
            {#if pro}
              <span class="ml-auto flex items-center gap-1 rounded-full border border-line px-2 py-px text-[9.5px] font-medium text-ok">
                <span class="h-[5px] w-[5px] rounded-full bg-ok"></span>
                Active
              </span>
            {:else}
              <button
                class="ml-auto rounded-full border border-line px-2 py-px text-[9.5px] font-medium text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                onclick={() => (licenseOpen = !licenseOpen)}
              >
                I have a key
              </button>
            {/if}
          </div>
          {#if !pro}
            <ul class="flex flex-col gap-[7px] px-4 py-3">
              {#each PRO_FEATURES as feature}
                <li class="flex items-start gap-2 text-[11px] leading-snug text-ink-3">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="mt-[2px] shrink-0" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  {feature}
                </li>
              {/each}
            </ul>
            {#if licenseOpen}
              <div class="flex flex-col gap-1.5 border-t border-line px-4 py-3">
                <div class="flex gap-1.5">
                  <input
                    bind:value={licenseInput}
                    placeholder="CG-XXXX-XXXX-XXXX"
                    spellcheck="false"
                    class="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 font-mono text-[11px] uppercase transition-colors placeholder:normal-case placeholder:text-ink-3 focus:border-accent focus:outline-none {licenseError ? 'border-danger' : ''}"
                  />
                  <button
                    onclick={unlockPro}
                    class="h-8 shrink-0 rounded-lg bg-accent px-3 text-[11.5px] font-medium text-white transition-all hover:brightness-110"
                  >
                    Unlock
                  </button>
                </div>
                {#if licenseError}
                  <p class="text-[10.5px] text-danger">That doesn't look like a valid key.</p>
                {/if}
              </div>
            {/if}
          {:else}
            <p class="px-4 py-3 text-[11px] leading-snug text-ink-3">
              Unlimited element picker · all AI formats · response inspector ·
              report download — thank you for supporting Context Grabber.
            </p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <footer class="border-t border-line px-5 py-2.5 text-center">
    <p class="text-[10px] tracking-[0.02em] text-ink-3">
      Everything stays on your computer — always
    </p>
  </footer>
</main>
