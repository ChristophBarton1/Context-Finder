<script lang="ts">
  import { onMount } from 'svelte';
  import type { CaptureData, PickedElement } from '@/utils/types';
  import { FREE_PICKS_PER_DAY } from '@/utils/types';
  import { groupErrors, detectIssueTags } from '@/utils/report';
  import { EXPORT_TARGETS, MAX_PREFILL_URL, buildExport } from '@/utils/export-targets';
  import { LICENSE_STORAGE_KEY, isProKey, normalizeKey } from '@/utils/license';
  import { TARGET_ICONS, STACK_ICONS, type BrandIcon } from '@/utils/icons';
  import { isTracker, isNoiseMessage } from '@/utils/trackers';

  type ViewState = 'loading' | 'ready' | 'unavailable' | 'needsreload';
  type Tab = 'export' | 'report' | 'screenshot' | 'element' | 'network';

  let view: ViewState = $state('loading');
  let data = $state<CaptureData | null>(null);
  let picked = $state<PickedElement | null>(null);
  let expectation = $state('');
  let copyState: 'idle' | 'busy' | 'done' = $state('idle');
  let photoState: 'idle' | 'done' = $state('idle');
  let picksUsedToday = $state(0);
  let activeTab: Tab = $state('export');
  let targetId = $state('claude');
  let menuOpen = $state(false);
  let pro = $state(false);
  let settingsOpen = $state(false);
  let licenseInput = $state('');
  let licenseError = $state(false);
  let shotUrl = $state<string | null>(null);
  let capturedAt = $state(Date.now());
  let now = $state(Date.now());
  let detailsOpen = $state(false);
  let historyOpen = $state(false);
  let history = $state<HistoryEntry[]>([]);
  let historyCopied = $state(-1);

  interface HistoryEntry {
    host: string;
    time: number;
    problems: number;
    target: string;
    text: string;
  }

  let tabId: number | undefined;
  let pageUrl = '';
  let expectationEl: HTMLTextAreaElement | undefined = $state();

  const target = $derived(EXPORT_TARGETS.find((t) => t.id === targetId) ?? EXPORT_TARGETS[0]);
  const picksLeft = $derived(pro ? 999 : Math.max(0, FREE_PICKS_PER_DAY - picksUsedToday));
  const errorCount = $derived(
    (data?.errors ?? []).filter((e) => !isNoiseMessage(e.message)).length
  );
  const groupedErrors = $derived(groupErrors(data?.errors ?? []));
  const failures = $derived((data?.network ?? []).filter((n) => !isTracker(n.url)));
  const trackers = $derived((data?.network ?? []).filter((n) => isTracker(n.url)));
  const isCsp = (s?: string) => /content security policy/i.test(s ?? '');
  const cspCount = $derived(
    failures.filter((n) => isCsp(n.statusText)).length +
      groupedErrors.filter((e) => isCsp(e.message)).length
  );
  const netFailCount = $derived(failures.filter((n) => !isCsp(n.statusText)).length);
  const problemCount = $derived(errorCount + failures.length);
  const tags = $derived(data ? detectIssueTags(data) : []);
  const stack = $derived(data?.page.stack ?? []);
  const preview = $derived(data ? buildExport(targetId, { data, picked, expectation, pro }) : null);
  const redactedCount = $derived(preview?.redactedCount ?? 0);
  const capturedAgo = $derived.by(() => {
    const s = Math.max(0, Math.round((now - capturedAt) / 1000));
    if (s < 60) return `${s}s`;
    return `${Math.round(s / 60)}m`;
  });
  const quality = $derived.by(() => {
    const items: { label: string; ok: boolean; tab?: Tab }[] = [
      { label: 'Errors', ok: true },
      { label: 'Network', ok: true },
      { label: 'Screenshot', ok: !!shotUrl, tab: 'screenshot' },
      { label: 'User action', ok: expectation.trim().length > 0, tab: 'export' },
      { label: 'Selected element', ok: !!picked, tab: 'element' },
    ];
    return { items, score: items.filter((i) => i.ok).length * 20 };
  });
  const todayKey = () => `picks_${new Date().toISOString().slice(0, 10)}`;

  const ACTION_CHIPS = ['Clicked button', 'Submitted form', 'Opened page', 'Logged in'];

  async function fetchData() {
    if (tabId == null) return;
    data = (await browser.tabs.sendMessage(tabId, { type: 'cg:getData' })) as CaptureData;
    capturedAt = Date.now();
    now = Date.now();
  }

  // A page that was already open before the extension was (re)loaded has no
  // capture script attached yet, so sendMessage fails. That is fixable with a
  // reload — unlike genuinely restricted pages (chrome://, the Web Store,
  // file://) where extensions can never run. Distinguish the two so we show
  // the right message instead of a misleading "off-limits".
  function isRestrictedUrl(u: string): boolean {
    if (!u) return true; // url hidden from us → almost always a chrome:// page
    if (!/^https?:\/\//i.test(u)) return true; // chrome:, edge:, file:, about:, …
    return /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(u);
  }

  async function reloadPage() {
    if (tabId == null) return;
    try {
      await browser.tabs.reload(tabId);
    } catch {
      /* ignore */
    }
    window.close();
  }

  onMount(() => {
    const interval = setInterval(() => (now = Date.now()), 5000);
    (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
        pageUrl = tab?.url ?? '';
        if (tabId == null) throw new Error('no tab');

        // Capturability test: this throws only when no capture script is
        // attached (restricted page, or a tab opened before the extension).
        // The storage/pref reads below must not influence this decision.
        await fetchData();
      } catch {
        view = isRestrictedUrl(pageUrl) ? 'unavailable' : 'needsreload';
        return;
      }

      try {
        const stored = await browser.storage.session.get([`picked_${tabId}`, `shot_${tabId}`]);
        picked = (stored[`picked_${tabId}`] as PickedElement) ?? null;
        shotUrl = (stored[`shot_${tabId}`] as string) ?? null;

        const hist = await browser.storage.local.get('cg:history');
        history = (hist['cg:history'] as HistoryEntry[]) ?? [];

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

      } catch {
        /* storage/pref reads are best-effort — capture already works here */
      }
      view = 'ready';
    })();
    return () => clearInterval(interval);
  });

  function selectTarget(id: string) {
    const t = EXPORT_TARGETS.find((x) => x.id === id);
    menuOpen = false;
    if (!t) return;
    if (t.pro && !pro) {
      settingsOpen = true;
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
      browser.storage.local.set({ [LICENSE_STORAGE_KEY]: key }).catch(() => {});
    } else {
      licenseError = true;
    }
  }

  async function copyReport() {
    if (!preview || copyState === 'busy') return;
    copyState = 'busy';
    let ok = true;
    try {
      await navigator.clipboard.writeText(preview.text);
    } catch {
      ok = false;
    }
    copyState = ok ? 'done' : 'idle';
    if (!ok) return;
    // Remember this report locally (last 15) so it can be re-copied later.
    if (data) {
      const entry: HistoryEntry = {
        host: pageDisplay(data.page.url),
        time: Date.now(),
        problems: problemCount,
        target: target.label,
        text: preview.text,
      };
      history = [entry, ...history.filter((h) => !(h.host === entry.host && h.target === entry.target))].slice(0, 15);
      browser.storage.local.set({ 'cg:history': $state.snapshot(history) }).catch(() => {});
    }
    if (target.openUrl) {
      const prefillUrl = target.prefill?.(preview.text);
      const url = prefillUrl && prefillUrl.length <= MAX_PREFILL_URL ? prefillUrl : target.openUrl;
      browser.tabs.create({ url }).catch(() => {});
    }
    setTimeout(() => (copyState = 'idle'), 2600);
  }

  function downloadMd() {
    if (!pro) {
      settingsOpen = true;
      menuOpen = false;
      return;
    }
    if (!preview) return;
    const blob = new Blob([preview.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'debug-context.md';
    a.click();
    URL.revokeObjectURL(url);
    menuOpen = false;
  }

  async function captureShot() {
    try {
      shotUrl = await browser.tabs.captureVisibleTab({ format: 'png' });
      if (tabId != null && shotUrl) {
        browser.storage.session.set({ [`shot_${tabId}`]: shotUrl }).catch(() => {});
      }
    } catch {
      shotUrl = null;
    }
  }

  async function selectRegion() {
    if (tabId == null) return;
    await browser.tabs.sendMessage(tabId, { type: 'cg:selectRegion' });
    window.close();
  }

  async function copyHistory(i: number) {
    try {
      await navigator.clipboard.writeText(history[i].text);
      historyCopied = i;
      setTimeout(() => (historyCopied = -1), 2000);
    } catch {
      /* clipboard denied */
    }
  }

  function agoLabel(ts: number): string {
    const s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  async function copyPhoto() {
    if (!shotUrl) await captureShot();
    if (!shotUrl) return;
    try {
      const blob = await (await fetch(shotUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
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

  function applyChip(chip: string) {
    expectation = expectation.trim() ? `${expectation.trim()} · ${chip}` : `${chip}: `;
    expectationEl?.focus();
  }

  function jumpTo(tab?: Tab) {
    if (!tab) return;
    activeTab = tab;
    if (tab === 'export') setTimeout(() => expectationEl?.focus(), 50);
  }

  function pageDisplay(url: string): string {
    try {
      const u = new URL(url);
      return u.host + (u.pathname !== '/' ? u.pathname : '');
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
    'Client-ready summary in plain English',
    'GitHub issue & developer hand-off formats',
    'Unlimited element picker & report download',
  ];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'export', label: 'AI Export' },
    { id: 'report', label: 'Report' },
    { id: 'screenshot', label: 'Screenshot' },
    { id: 'element', label: 'Element' },
    { id: 'network', label: 'Network' },
  ];
</script>

{#snippet brandIcon(icon: BrandIcon | undefined, size: number)}
  {#if icon?.path}
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
      <path d={icon.path} fill={icon.color ?? 'currentColor'} />
    </svg>
  {:else if icon?.monogram}
    <span
      class="flex shrink-0 items-center justify-center font-mono font-bold"
      style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.52)}px;{icon?.color ? `color:${icon.color}` : ''}"
    >{icon.monogram}</span>
  {:else}
    <!-- no usable brand mark: keep labels aligned with an empty slot -->
    <span class="shrink-0" style="width:{size}px;height:{size}px"></span>
  {/if}
{/snippet}

{#snippet lockIcon()}
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="ml-auto text-ink-3" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" />
  </svg>
{/snippet}

<main class="w-[400px] font-sans text-[13px] leading-normal antialiased">
  <!-- Header -->
  <header class="flex items-center gap-2.5 px-5 pt-4 pb-3">
    <span class="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-accent-soft">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path d="M3 8l9 5 9-5M12 13v9" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      </svg>
    </span>
    <h1 class="text-[13px] font-semibold tracking-[-0.01em]">Context Grabber</h1>
    <span
      class="ml-auto flex items-center gap-1.5 rounded-full border border-line px-2 py-[3px] text-[10px] font-medium text-ink-2"
      title="Everything stays on your computer. Nothing is sent anywhere."
    >
      <span class="h-[5px] w-[5px] rounded-full bg-ok"></span>
      Local only
    </span>
    <button
      class="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      onclick={() => (settingsOpen = !settingsOpen)}
      title="Settings & Pro"
      aria-label="Settings"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
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
  {:else if view === 'needsreload'}
    <div class="flex flex-col items-center px-6 py-12 text-center">
      <span class="mb-3.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <p class="text-[13.5px] font-medium">Reload to start capturing</p>
      <p class="mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-ink-2">
        This tab was already open before Context Grabber started, so nothing was
        recorded yet. Reload it once and it will catch console errors and failed
        requests from the very first line.
      </p>
      <button
        onclick={reloadPage}
        class="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent px-5 text-[12.5px] font-medium text-white transition-all hover:brightness-110 active:scale-[0.99]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Reload this page
      </button>
    </div>
  {:else if data}
    <div class="flex flex-col gap-3 px-5 pb-4">
      <!-- Settings / Pro -->
      {#if settingsOpen}
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
          {:else}
            <p class="px-4 py-3 text-[11px] leading-snug text-ink-3">
              Response inspector · all formats · unlimited picker · download —
              thank you for supporting Context Grabber.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Last captured page -->
      <div class="rounded-xl border border-line bg-surface px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-[10.5px] font-medium tracking-[0.04em] text-ink-3">Last captured page</p>
            <p class="mt-0.5 truncate text-[13px] font-semibold tracking-[-0.01em]" title={data.page.url}>
              {pageDisplay(data.page.url)}
            </p>
            <p class="mt-0.5 text-[10.5px] text-ink-3">Captured {capturedAgo} ago</p>
          </div>
          <button
            onclick={fetchData}
            class="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Recapture
          </button>
          {#if history.length > 0}
            <button
              onclick={() => (historyOpen = !historyOpen)}
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors {historyOpen
                ? 'border-accent text-accent'
                : 'border-line text-ink-3 hover:border-line-strong hover:text-ink'}"
              title="Recent reports"
              aria-label="Recent reports"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          {/if}
        </div>
        {#if historyOpen && history.length > 0}
          <div class="mt-3 overflow-hidden rounded-lg border border-line bg-surface-2">
            <p class="px-3 pt-2 pb-1 text-[9.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Recent reports
            </p>
            <div class="max-h-[150px] overflow-y-auto pb-1">
              {#each history as h, i}
                <div class="flex items-center gap-2 px-3 py-1.5">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[11px] font-medium" title={h.host}>{h.host}</p>
                    <p class="text-[9.5px] text-ink-3">
                      {agoLabel(h.time)} · {h.problems} {h.problems === 1 ? 'problem' : 'problems'} · {h.target}
                    </p>
                  </div>
                  <button
                    onclick={() => copyHistory(i)}
                    class="shrink-0 rounded-md border border-line px-2 py-1 text-[10px] font-medium transition-colors {historyCopied === i
                      ? 'border-ok text-ok'
                      : 'text-ink-2 hover:border-line-strong hover:text-ink'}"
                  >
                    {historyCopied === i ? 'Copied' : 'Copy'}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <!-- Stat tiles -->
        <div class="mt-3 grid grid-cols-4 gap-2">
          <div class="flex flex-col items-center rounded-lg border border-line bg-surface-2 px-1 py-2">
            <p class="text-[15px] font-semibold {errorCount > 0 ? 'text-danger' : ''}">{errorCount}</p>
            <p class="text-center text-[9px] leading-tight text-ink-3">Errors</p>
          </div>
          <div class="flex flex-col items-center rounded-lg border border-line bg-surface-2 px-1 py-2">
            <p class="text-[15px] font-semibold {cspCount > 0 ? 'text-danger' : ''}">{cspCount}</p>
            <p class="text-center text-[9px] leading-tight text-ink-3">CSP Issues</p>
          </div>
          <div class="flex flex-col items-center rounded-lg border border-line bg-surface-2 px-1 py-2">
            <p class="text-[15px] font-semibold {netFailCount > 0 ? 'text-danger' : ''}">{netFailCount}</p>
            <p class="text-center text-[9px] leading-tight text-ink-3">Network Fails</p>
          </div>
          <div class="flex flex-col items-center rounded-lg border border-line bg-surface-2 px-1 py-2">
            <p class="text-[15px] font-semibold text-accent">{redactedCount}</p>
            <p class="text-center text-[9px] leading-tight text-ink-3">Secrets Redacted</p>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 rounded-[10px] bg-surface-2 p-1">
        {#each TABS as t}
          <button
            class="flex h-7 flex-1 items-center justify-center rounded-[7px] text-[10.5px] font-medium transition-colors {activeTab === t.id
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink-2'}"
            onclick={() => (activeTab = t.id)}
          >
            {t.label}
          </button>
        {/each}
      </div>

      {#if activeTab === 'export'}
        <!-- AI Export -->
        <div class="flex items-center">
          <div>
            <p class="text-[13px] font-semibold tracking-[-0.01em]">Export for AI</p>
            <p class="text-[11px] text-ink-3">Copy optimized context for any AI tool.</p>
          </div>
          <button
            class="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium text-accent hover:underline"
            onclick={() => (activeTab = 'report')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
            </svg>
            Preview
          </button>
        </div>

        <div class="relative grid grid-cols-[1fr_auto] gap-2">
          <button
            onclick={() => (menuOpen = !menuOpen)}
            class="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-[12.5px] font-medium transition-colors hover:border-line-strong"
            aria-label="Choose export format"
          >
            {@render brandIcon(TARGET_ICONS[target.id], 15)}
            {target.label}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="ml-auto text-ink-3 transition-transform {menuOpen ? 'rotate-180' : ''}" aria-hidden="true">
              <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <button
            onclick={copyReport}
            disabled={copyState === 'busy'}
            class="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[12.5px] font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {#if copyState === 'done'}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Done!
            {:else if copyState === 'busy'}
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white"></span>
            {:else}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" />
              </svg>
              {target.openUrl ? `Send to ${target.label}` : `Copy for ${target.label}`}
            {/if}
          </button>

          {#if menuOpen}
            <div class="absolute top-[44px] right-0 left-0 z-20 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <div class="max-h-[260px] overflow-y-auto">
                {#each EXPORT_TARGETS.filter((t) => !t.pro) as t}
                  <button
                    onclick={() => selectTarget(t.id)}
                    class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12px] font-medium transition-colors hover:bg-surface-2 {t.id === targetId ? 'text-accent' : 'text-ink-2'}"
                  >
                    {@render brandIcon(TARGET_ICONS[t.id], 14)}
                    {t.label}
                    {#if t.id === targetId}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="ml-auto text-accent" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    {/if}
                  </button>
                {/each}
                <div class="border-t border-line"></div>
                {#each EXPORT_TARGETS.filter((t) => t.pro) as t}
                  <button
                    onclick={() => selectTarget(t.id)}
                    class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12px] font-medium transition-colors hover:bg-surface-2 {t.id === targetId ? 'text-accent' : 'text-ink-2'}"
                  >
                    {@render brandIcon(TARGET_ICONS[t.id], 14)}
                    {t.label}
                    {#if t.id === targetId}
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="ml-auto text-accent" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    {:else if !pro}
                      {@render lockIcon()}
                    {/if}
                  </button>
                {/each}
                <div class="border-t border-line"></div>
                <button
                  onclick={downloadMd}
                  class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  Download debug-context.md
                  {#if !pro}
                    {@render lockIcon()}
                  {/if}
                </button>
              </div>
            </div>
          {/if}
        </div>

        <p class="-mt-1 text-center text-[10.5px] leading-relaxed text-ink-3">
          {#if copyState === 'done'}
            {#if target.prefill}
              {target.label} opened — your report is already in the chat
            {:else if target.openUrl}
              {target.label} opened — paste with Ctrl+V
            {:else}
              Copied — paste it into {target.label}
            {/if}
          {:else if target.prefill}
            Opens {target.label} with the report already in the chat.
          {:else if target.openUrl}
            Copies the report and opens {target.label} — just paste.
          {:else}
            Formatted for {target.label} — paste it there when copied.
          {/if}
        </p>

        <!-- Report quality -->
        <div class="rounded-xl border border-line bg-surface px-4 py-3">
          <div class="flex items-center">
            <p class="text-[12px] font-semibold">Report Quality</p>
            <p class="ml-auto text-[13px] font-semibold text-accent">{quality.score}%</p>
          </div>
          <div class="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
            <div class="h-full rounded-full bg-accent transition-all duration-300" style="width:{quality.score}%"></div>
          </div>
          <div class="mt-2.5 flex flex-col gap-1">
            {#each quality.items as item}
              <div class="flex items-center text-[11px]">
                <span class="text-ink-2">{item.label}</span>
                {#if item.ok}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" class="ml-auto text-ok" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {:else}
                  <button class="ml-auto flex items-center gap-1 text-[10.5px] font-medium text-accent hover:underline" onclick={() => jumpTo(item.tab)}>
                    + Add
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <!-- Detected -->
        {#if stack.length > 0 || tags.length > 0}
          <div class="rounded-xl border border-line bg-surface px-4 py-3">
            <p class="text-[12px] font-semibold">Detected</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each stack as s}
                <span class="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10.5px] font-medium text-ink-2">
                  {@render brandIcon(STACK_ICONS[s], 11)}
                  {s}
                </span>
              {/each}
              {#each (detailsOpen ? tags : tags.slice(0, 2)) as tag}
                <span class="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[10.5px] font-medium text-ink-2">
                  <span class="h-[5px] w-[5px] rounded-full bg-danger"></span>
                  {tag}
                </span>
              {/each}
            </div>
            {#if tags.length > 2}
              <button class="mt-2 flex items-center gap-1 text-[11px] font-medium text-accent hover:underline" onclick={() => (detailsOpen = !detailsOpen)}>
                {detailsOpen ? 'Hide details' : 'Show details'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" class="transition-transform {detailsOpen ? 'rotate-180' : ''}" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            {/if}
          </div>
        {/if}

        <!-- User action -->
        <div class="rounded-xl border border-line bg-surface px-4 py-3">
          <p class="text-[12px] font-semibold">What were you trying to do?</p>
          <textarea
            bind:value={expectation}
            bind:this={expectationEl}
            rows="2"
            placeholder="e.g. I clicked the submit button and nothing happened…"
            class="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed transition-colors placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none"
          ></textarea>
          <div class="mt-1.5 flex flex-wrap gap-1.5">
            {#each ACTION_CHIPS as chip}
              <button
                class="rounded-lg border border-line px-2.5 py-1 text-[10.5px] font-medium text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
                onclick={() => applyChip(chip)}
              >
                {chip}
              </button>
            {/each}
          </div>
        </div>
      {:else if activeTab === 'report'}
        <!-- Report preview -->
        <div class="overflow-hidden rounded-xl border border-line bg-surface">
          <div class="flex items-center border-b border-line px-4 py-2.5">
            <p class="text-[11px] font-semibold">Report preview — exactly what gets copied</p>
            {#if redactedCount > 0}
              <span class="ml-auto text-[10px] text-ink-3">{redactedCount} {redactedCount === 1 ? 'secret' : 'secrets'} hidden</span>
            {/if}
          </div>
          <pre class="max-h-[300px] overflow-y-auto px-4 py-3 font-mono text-[10.5px] leading-[1.6] whitespace-pre-wrap text-ink-2">{preview?.text ?? ''}</pre>
        </div>
      {:else if activeTab === 'screenshot'}
        <!-- Screenshot -->
        <div class="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
          {#if shotUrl}
            <img src={shotUrl} alt="Screenshot of the captured page" class="max-h-[220px] rounded-lg border border-line object-contain" />
          {:else}
            <p class="text-[11.5px] leading-relaxed text-ink-3">
              A picture of the page — useful for visual bugs. Paste it as a
              second message after the report.
            </p>
          {/if}
          <div class="grid grid-cols-3 gap-2">
            <button
              onclick={captureShot}
              class="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[11.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
              </svg>
              {shotUrl ? 'Retake' : 'Capture'}
            </button>
            <button
              onclick={selectRegion}
              title="Drag a rectangle over the part of the page you want to capture"
              class="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[11.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <rect x="8" y="8" width="8" height="8" rx="1" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" />
              </svg>
              Select area
            </button>
            <button
              onclick={copyPhoto}
              class="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent text-[12px] font-medium text-white transition-all hover:brightness-110"
            >
              {#if photoState === 'done'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Copied!
              {:else}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" />
                </svg>
                Copy photo
              {/if}
            </button>
          </div>
        </div>
      {:else if activeTab === 'element'}
        <!-- Element -->
        {#if picked}
          <div class="rounded-xl border border-line bg-surface px-4 py-3.5">
            <div class="flex items-center">
              <p class="text-[12px] font-semibold">Element in report</p>
              <button
                class="ml-auto flex h-5 w-5 items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                onclick={clearPicked}
                title="Remove from report"
                aria-label="Remove element from report"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
                </svg>
              </button>
            </div>
            <p class="mt-1.5 truncate font-mono text-[10.5px] text-accent">{picked.selector}</p>
            <pre class="mt-2 max-h-[140px] overflow-y-auto rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[10px] leading-[1.55] whitespace-pre-wrap text-ink-2">{picked.html.slice(0, 600)}</pre>
          </div>
        {:else}
          <div class="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
            <p class="text-[11.5px] leading-relaxed text-ink-3">
              Point at the broken part of the page — its selector, HTML and key
              styles get added to the report so the AI knows exactly where to look.
            </p>
            <button
              onclick={startPick}
              disabled={picksLeft <= 0}
              class="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              Point at the bug
              {#if !pro}
                <span class="font-mono text-[10px] text-white/70">{picksLeft}/{FREE_PICKS_PER_DAY}</span>
              {/if}
            </button>
            {#if !pro && picksLeft <= 0}
              <p class="text-center text-[10.5px] text-ink-3">
                Daily limit reached — Pro removes it.
              </p>
            {/if}
          </div>
        {/if}
      {:else if activeTab === 'network'}
        <!-- Network -->
        <div class="overflow-hidden rounded-xl border border-line bg-surface">
          {#if failures.length === 0 && trackers.length === 0}
            <p class="px-4 py-6 text-center text-[12px] text-ink-3">No failed requests on this page.</p>
          {:else}
            <div class="max-h-[300px] overflow-y-auto py-1.5">
              {#each failures as req}
                <div class="px-4 py-1.5">
                  <div class="flex items-start gap-2">
                    <span class="mt-[1px] shrink-0 rounded bg-danger-soft px-1.5 py-px font-mono text-[9.5px] font-medium text-danger">
                      {req.status === 0 ? 'failed' : req.status}
                    </span>
                    <p class="min-w-0 truncate font-mono text-[11px] leading-[1.5] text-ink-2" title={req.url}>
                      {req.method} {shortUrl(req.url)}
                    </p>
                  </div>
                  {#if req.body}
                    {#if pro}
                      <p class="mt-1 ml-9 truncate rounded bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-3" title={req.body}>
                        {req.body.slice(0, 120)}
                      </p>
                    {:else}
                      <button class="mt-1 ml-9 flex items-center gap-1 text-[10px] text-ink-3 hover:text-ink" onclick={() => (settingsOpen = true)}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" />
                          <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="2" />
                        </svg>
                        Server response captured — unlock with Pro
                      </button>
                    {/if}
                  {/if}
                </div>
              {/each}
              {#if trackers.length > 0}
                <p class="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  Blocked ad-trackers · {trackers.length} — harmless
                </p>
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
              {/if}
            </div>
          {/if}
        </div>
        {#if errorCount > 0}
          <div class="overflow-hidden rounded-xl border border-line bg-surface">
            <p class="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Console errors · {errorCount}
            </p>
            <div class="max-h-[160px] overflow-y-auto pb-1.5">
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
            </div>
          </div>
        {/if}
      {/if}

      <!-- Privacy footer -->
      <div class="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="shrink-0 text-ok" aria-hidden="true">
          <path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
          <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="min-w-0 flex-1">
          <p class="text-[11.5px] font-semibold">Privacy First</p>
          <p class="text-[10.5px] leading-snug text-ink-3">
            All data stays on your device. Nothing is sent to our servers.
          </p>
        </div>
      </div>
    </div>
  {/if}

  {#if problemCount === 0 && view === 'ready'}
    <footer class="border-t border-line px-5 py-2 text-center">
      <p class="text-[10px] tracking-[0.02em] text-ink-3">No problems on this page right now — all clear</p>
    </footer>
  {/if}
</main>
