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
      text: 'Click the button below. It triggers a real console error and a failed network request — the kind of thing that silently breaks AI-built apps.',
    },
    {
      title: 'Open Context Grabber',
      text: 'Click the extension icon in your toolbar. The badge already shows the number of errors it caught — automatically, in the background.',
    },
    {
      title: 'Paste it into your AI',
      text: 'Hit “Copy report for my AI” and paste into Claude, ChatGPT or Cursor. That’s it — your AI sees exactly what broke and where.',
    },
  ];
</script>

<div class="mx-auto flex min-h-screen max-w-[1040px] flex-col px-6 py-14 font-sans antialiased lg:px-10">
  <!-- Top bar -->
  <header class="mb-16 flex items-center gap-2.5">
    <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="text-accent" aria-hidden="true">
        <path d="M13 2 4.5 13.5h6L10 22l8.5-11.5h-6L13 2Z" fill="currentColor" />
      </svg>
    </span>
    <span class="text-[13px] font-semibold tracking-[-0.01em]">Context Grabber</span>
    <span class="ml-auto flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2">
      <span class="h-[5px] w-[5px] rounded-full bg-ok"></span>
      100% local
    </span>
  </header>

  <div class="grid items-start gap-14 lg:grid-cols-[1fr_400px]">
    <!-- Left: copy + steps + demo -->
    <div>
      <h1 class="max-w-md text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
        Catch your first bug in 30 seconds.
      </h1>
      <p class="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
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
              class="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-[11.5px] font-medium text-ink-2"
            >
              {i + 1}
            </span>
            <div class="pt-0.5">
              <p class="text-[14px] font-medium">{step.title}</p>
              <p class="mt-1 max-w-sm text-[13.5px] leading-relaxed text-ink-2">{step.text}</p>
            </div>
          </li>
        {/each}
      </ol>

      <!-- Demo panel -->
      <div class="mt-10 rounded-xl border border-line bg-surface p-6">
        <div class="mb-4 flex items-center gap-2">
          <span class="h-[5px] w-[5px] rounded-full bg-accent"></span>
          <p class="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Demo playground</p>
        </div>
        <p class="text-[13.5px] text-ink-2">This button is broken on purpose. Go ahead:</p>
        <button
          onclick={breakIt}
          class="mt-4 h-9 rounded-[10px] bg-accent px-5 text-[13px] font-medium text-white transition-all duration-150 hover:brightness-110 active:scale-[0.99]"
        >
          Load my profile
        </button>
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
        {/if}
      </div>
    </div>

    <!-- Right: what your AI receives -->
    <aside class="lg:sticky lg:top-10">
      <p class="mb-3 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
        What your AI receives
      </p>
      <div class="overflow-hidden rounded-xl border border-line bg-surface">
        <div class="flex items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="h-[9px] w-[9px] rounded-full bg-line-strong"></span>
          <span class="ml-2 font-mono text-[10.5px] text-ink-3">bug-report.md</span>
        </div>
        <pre class="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-[1.7] text-ink-2"><span class="font-semibold text-ink"># Bug report</span>

<span class="text-ink">**What I expected:**</span> Profile loads
<span class="text-ink">**URL:**</span> myapp.lovable.app/profile
<span class="text-ink">**Browser:**</span> Chrome 137 · 1440×900
<span class="text-ink">**Screenshot:**</span> attached

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
        Structured, complete, redacted. The difference between “it doesn't work”
        and a fix that works on the first try.
      </p>
    </aside>
  </div>

  <footer class="mt-20 border-t border-line pt-6">
    <p class="max-w-2xl text-[12px] leading-relaxed text-ink-3">
      Context Grabber runs 100% locally. Nothing you capture ever leaves your browser —
      no servers, no tracking, no analytics. Obvious secrets such as API keys, tokens and
      passwords are automatically redacted before a report is copied.
    </p>
  </footer>
</div>
