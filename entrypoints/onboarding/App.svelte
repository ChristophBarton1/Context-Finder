<script lang="ts">
  let bugTriggered = $state(false);

  function breakIt() {
    bugTriggered = true;
    // Three realistic failure modes the extension should catch:
    console.error(
      "TypeError: Cannot read properties of undefined (reading 'user') at loadProfile (app.js:42)"
    );
    fetch('/api/this-endpoint-does-not-exist').catch(() => {});
    setTimeout(() => {
      throw new Error('Demo crash: profile data was never loaded');
    }, 50);
  }

  const steps = [
    {
      title: 'Break this page',
      text: 'Click the button in the demo app below. It triggers a real console error and a failed network request — the kind of thing that silently breaks AI-built apps.',
    },
    {
      title: 'Open Context Grabber',
      text: 'Click the extension icon in your toolbar. The badge already shows the number of errors it caught — automatically, in the background.',
    },
    {
      title: 'Send it to your AI',
      text: 'Hit "Send to Claude" or ChatGPT — or straight into your Lovable/Bolt chat. The full report lands in the input, ready to send. Tools like Cursor get a perfectly formatted copy to paste.',
    },
  ];

  const features = [
    {
      title: '100% private',
      text: 'No servers, no tracking, no account. Everything stays in your browser — secrets are redacted automatically.',
      icon: 'shield',
    },
    {
      title: 'Made for AI workflows',
      text: 'One report format per tool: Claude, ChatGPT, Gemini, Grok, Cursor, Claude Code — plus direct injection into Lovable, Bolt, Replit, v0 & Base44 chats.',
      icon: 'spark',
    },
    {
      title: 'Sees what you can’t',
      text: 'Console errors, failed requests, CSP blocks, broken assets — even inside iframes like Lovable or Bolt previews.',
      icon: 'eye',
    },
  ];
</script>

{#snippet cubeLogo(size: number)}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <path d="M3 8l9 5 9-5M12 13v9" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
  </svg>
{/snippet}

<!-- Toolbar hint after the bug is triggered -->
{#if bugTriggered}
  <div class="fixed top-3 right-6 z-50 flex items-center gap-2.5 rounded-xl border border-border-strong bg-surface px-4 py-2.5 shadow-lg">
    <span class="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-ink">
      {@render cubeLogo(12)}
    </span>
    <p class="text-[12.5px] font-medium">
      Now click the extension icon up here
    </p>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
{/if}

<div class="cg-brand mx-auto flex min-h-screen max-w-[1120px] flex-col px-6 py-14 font-sans antialiased lg:px-10">
  <!-- Top bar -->
  <header class="cg-rise mb-16 flex items-center gap-3">
    <span class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-accent-ink shadow-[0_1px_0_rgba(28,24,18,0.18)]">
      {@render cubeLogo(17)}
    </span>
    <span class="text-[16px] font-medium tracking-[-0.01em]">Context Grabber</span>
    <span class="ml-auto flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-2">
      <span class="h-[5px] w-[5px] rounded-full bg-ok"></span>
      Local only
    </span>
  </header>

  <div class="grid items-start gap-16 lg:grid-cols-[1fr_400px]">
    <!-- Left: copy + steps + demo -->
    <div>
      <div class="cg-rise flex flex-wrap items-center gap-2">
        <span class="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[10.5px] font-medium text-ink-2">No account</span>
        <span class="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[10.5px] font-medium text-ink-2">No servers</span>
        <span class="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[10.5px] font-medium text-ink-2">Free</span>
      </div>

      <p class="cg-rise mt-7 text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase" style="animation-delay:.05s">Welcome</p>
      <h1 class="font-display cg-rise mt-4 max-w-2xl text-[clamp(2.6rem,5.2vw,3.9rem)]" style="animation-delay:.1s">
        Catch your first bug<br />in <span class="cg-mark">30 seconds</span>.
      </h1>
      <p class="cg-rise mt-6 max-w-lg text-[17px] leading-relaxed text-ink-2" style="animation-delay:.16s">
        When your AI-built app breaks, “it doesn't work” makes the AI guess.
        Context Grabber hands it the actual errors — so the fix works on the first try.
      </p>

      <!-- Steps -->
      <ol class="mt-10 flex flex-col">
        {#each steps as step, i}
          <li class="relative flex gap-4 pb-8 last:pb-0">
            {#if i < steps.length - 1}
              <span class="absolute top-8 left-[13px] h-[calc(100%-36px)] w-px bg-line"></span>
            {/if}
            <span
              class="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full font-mono text-[11.5px] font-medium {i === 0 && !bugTriggered
                ? 'bg-accent text-accent-ink'
                : i === 0 || (i === 1 && bugTriggered)
                  ? 'border border-ink-3 bg-surface-2 text-ink'
                  : 'border border-line bg-surface text-ink-2'}"
            >
              {#if i === 0 && bugTriggered}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              {:else}
                {i + 1}
              {/if}
            </span>
            <div class="pt-0.5">
              <p class="text-[14px] font-medium">{step.title}</p>
              <p class="mt-1 max-w-sm text-[13.5px] leading-relaxed text-ink-2">{step.text}</p>
            </div>
          </li>
        {/each}
      </ol>

      <!-- Demo app -->
      <div class="cg-rise mt-12 overflow-hidden rounded-2xl border border-line bg-surface" style="animation-delay:.22s">
        <div class="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="ml-2 font-mono text-[10.5px] text-ink-3">my-broken-app.demo — built with AI, broken on purpose</span>
        </div>
        <div class="p-6">
          <div class="flex items-center gap-4">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3">
              {#if bugTriggered}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="text-danger" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
                </svg>
              {:else}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
                  <path d="M4 21c0-3.5 3.6-6 8-6s8 2.5 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              {/if}
            </span>
            <div class="min-w-0 flex-1">
              {#if bugTriggered}
                <p class="text-[14px] font-medium text-danger">Failed to load profile</p>
                <p class="mt-0.5 text-[12.5px] text-ink-3">undefined is not an object · /api/profile → 404</p>
              {:else}
                <div class="h-3.5 w-36 rounded bg-surface-2"></div>
                <div class="mt-2 h-3 w-24 rounded bg-surface-2"></div>
              {/if}
            </div>
            <button
              onclick={breakIt}
              disabled={bugTriggered}
              class="h-9 shrink-0 rounded-full bg-accent px-5 text-[13px] font-semibold text-accent-ink transition-all duration-200 ease-out hover:bg-white active:scale-[0.99] disabled:opacity-50"
            >
              Load my profile
            </button>
          </div>

          {#if bugTriggered}
            <div class="mt-5 rounded-[10px] border border-line bg-danger-soft px-4 py-3.5">
              <p class="flex items-center gap-2 text-[13px] font-medium text-danger">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                Something went wrong. (Perfect.)
              </p>
              <p class="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                One console error, one uncaught exception and one failed request just happened.
                Now click the <strong class="font-medium text-ink">Context Grabber icon</strong> in
                your toolbar — it caught all of it.
              </p>
            </div>
          {:else}
            <p class="mt-4 text-[12px] text-ink-3">
              This profile card is broken on purpose. Go ahead — you can't damage anything.
            </p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Right: what your AI receives -->
    <aside class="cg-rise lg:sticky lg:top-10" style="animation-delay:.28s">
      <p class="mb-3 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        What your AI receives
      </p>

      <!-- mini stat strip, mirrors the popup -->
      <div class="mb-3 grid grid-cols-4 gap-2">
        <div class="flex flex-col items-center rounded-lg border border-line bg-surface px-1 py-2">
          <p class="text-[14px] font-semibold text-danger">2</p>
          <p class="text-center text-[8.5px] leading-tight text-ink-3">Errors</p>
        </div>
        <div class="flex flex-col items-center rounded-lg border border-line bg-surface px-1 py-2">
          <p class="text-[14px] font-semibold">0</p>
          <p class="text-center text-[8.5px] leading-tight text-ink-3">CSP Issues</p>
        </div>
        <div class="flex flex-col items-center rounded-lg border border-line bg-surface px-1 py-2">
          <p class="text-[14px] font-semibold text-danger">1</p>
          <p class="text-center text-[8.5px] leading-tight text-ink-3">Network Fails</p>
        </div>
        <div class="flex flex-col items-center rounded-lg border border-accent bg-accent-soft px-1 py-2">
          <p class="text-[14px] font-semibold text-ink">3</p>
          <p class="text-center text-[8.5px] leading-tight text-ink-3">Secrets Redacted</p>
        </div>
      </div>

      <div class="overflow-hidden rounded-2xl border border-line bg-surface">
        <div class="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="ml-2 font-mono text-[10.5px] text-ink-3">debug-context.md</span>
          <span class="ml-auto rounded border border-line px-1.5 py-px font-mono text-[9px] text-ink-3">ready to paste</span>
        </div>
        <pre class="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-[1.7] text-ink-2"><span class="font-semibold text-ink"># Bug report</span>

<span class="text-ink">**What I expected:**</span> Profile loads
<span class="text-ink">**URL:**</span> myapp.lovable.app/profile
<span class="text-ink">**Browser:**</span> Chrome 137 · 1440×900
<span class="text-ink">**Detected stack:**</span> React
<span class="text-ink">**Detected issue types:**</span> JS runtime
error, 404 not found

<span class="font-semibold text-ink">## Console errors (2)</span>
<span class="text-danger">[error]</span> TypeError: Cannot read
  properties of undefined
  (reading 'user') at app.js:42
<span class="text-danger">[uncaught]</span> Demo crash: profile
  data was never loaded

<span class="font-semibold text-ink">## Failed network requests (1)</span>
- `GET` /api/profile → <span class="text-danger">404</span>

<span class="font-semibold text-ink">## Task</span>
Identify the most likely root
cause and provide a concrete
fix…</pre>
      </div>
      <p class="mt-3 text-[12px] leading-relaxed text-ink-3">
        Structured, complete, redacted — and sent straight into Claude, ChatGPT
        or your Lovable chat with one click. The difference between “it doesn't
        work” and a fix that works on the first try.
      </p>
    </aside>
  </div>

  <!-- Feature row -->
  <div class="cg-rise mt-28 grid gap-5 border-t border-line pt-12 sm:grid-cols-3" style="animation-delay:.34s">
    {#each features as f}
      <div class="rounded-2xl border border-line bg-surface px-5 py-4">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
          {#if f.icon === 'shield'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {:else if f.icon === 'spark'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
            </svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" stroke-width="2" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" />
            </svg>
          {/if}
        </span>
        <p class="mt-3 text-[13.5px] font-semibold">{f.title}</p>
        <p class="mt-1 text-[12.5px] leading-relaxed text-ink-3">{f.text}</p>
      </div>
    {/each}
  </div>

  <footer class="mt-14 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
    <p class="max-w-2xl text-[12px] leading-relaxed text-ink-3">
      Context Grabber runs 100% locally. Nothing you capture ever leaves your browser —
      no servers, no tracking, no analytics. Obvious secrets such as API keys, tokens and
      passwords are automatically redacted before a report is copied.
    </p>
    <span class="flex items-center gap-2 sm:ml-auto">
      <span class="flex h-5 w-5 items-center justify-center rounded-md bg-accent text-accent-ink">
        {@render cubeLogo(10)}
      </span>
      <span class="text-[11px] font-medium text-ink-3">Context Grabber</span>
    </span>
  </footer>
</div>
