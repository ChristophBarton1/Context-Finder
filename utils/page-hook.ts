/**
 * The complete page-world capture hook as ONE self-contained function.
 *
 * It is used in two ways:
 *  1. Serialized via `cgPageHook.toString()` and injected as an anonymous
 *     inline <script> by capture.content.ts. This is the preferred path:
 *     the code then belongs to the page, so Chrome's extension error
 *     collector does NOT attribute the page's console noise to us.
 *  2. Called directly by injected.content.ts (MAIN-world content script)
 *     as a fallback for pages whose CSP blocks inline scripts.
 *
 * The `__contextGrabber` guard ensures exactly one of the two installs.
 * IMPORTANT: keep this function fully self-contained – no imports, no
 * closure variables – or the serialized copy will break.
 */
export function cgPageHook() {
  const w = window as typeof window & { __contextGrabber?: boolean };
  if (w.__contextGrabber) return;
  w.__contextGrabber = true;

  const MAX_ENTRIES = 50;
  const store = {
    errors: [] as { level: string; message: string; time: string }[],
    network: [] as {
      url?: string;
      method?: string;
      status: number;
      statusText?: string;
      time: string;
    }[],
  };

  const fmt = (a: unknown): string => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  };

  let sendQueued = false;
  const send = () => {
    if (sendQueued) return;
    sendQueued = true;
    setTimeout(() => {
      sendQueued = false;
      try {
        window.postMessage({ source: 'context-grabber', payload: store }, '*');
      } catch {
        /* never break the page */
      }
    }, 150);
  };

  const push = (arr: { time: string }[], item: object) => {
    arr.push({ ...item, time: new Date().toISOString() } as { time: string });
    if (arr.length > MAX_ENTRIES) arr.shift();
    send();
  };

  const pushNetwork = (item: {
    url?: string;
    method?: string;
    status: number;
    statusText?: string;
  }) => {
    // A broken image repeated 40× across the page is one problem, not 40.
    if (store.network.some((n) => n.url === item.url && n.status === item.status)) return;
    push(store.network, item);
  };

  // --- console hooks ----------------------------------------------------
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level];
    const wrapped = function (this: unknown, ...args: unknown[]) {
      try {
        push(store.errors, {
          level,
          message: args.map(fmt).join(' ').slice(0, 2000),
        });
      } catch {
        /* never break the page */
      }
      return orig.apply(this ?? console, args);
    };
    try {
      Object.defineProperty(wrapped, 'name', { value: level, configurable: true });
      Object.defineProperty(wrapped, 'toString', {
        value: function toString() {
          return Function.prototype.toString.call(orig);
        },
        writable: true,
        configurable: true,
      });
    } catch {
      /* identity polish is best-effort */
    }
    console[level] = wrapped;
  }

  // Capture phase is required: resource load errors (broken images, missing
  // scripts/stylesheets) fire on the element and never bubble.
  window.addEventListener(
    'error',
    (e: Event) => {
      if (e instanceof ErrorEvent) {
        push(store.errors, {
          level: 'uncaught',
          message: `${e.message} @ ${e.filename || '?'}:${e.lineno ?? '?'}:${e.colno ?? '?'}`,
        });
        return;
      }
      const t = e.target as
        | (Element & { src?: string; href?: string; currentSrc?: string })
        | null;
      if (t && t.tagName) {
        // An empty src attribute resolves to the page's own URL – reporting
        // "GET <page url> failed" would only mislead the AI. Skip those.
        const attr = t.getAttribute?.('src') || t.getAttribute?.('href');
        const url = t.currentSrc || t.src || t.href;
        if (attr && url && url !== location.href) {
          pushNetwork({
            url,
            method: 'GET',
            status: 0,
            statusText: `Failed to load <${t.tagName.toLowerCase()}>`,
          });
        }
      }
    },
    true
  );

  // Requests blocked by the page's Content Security Policy. Only real URLs:
  // blockedURI can be "inline"/"eval" (e.g. our own fallback injection).
  document.addEventListener('securitypolicyviolation', (e) => {
    if (!/^https?:/.test(e.blockedURI)) return;
    pushNetwork({
      url: e.blockedURI,
      method: 'GET',
      status: 0,
      statusText: `Blocked by Content Security Policy (${e.violatedDirective})`,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    push(store.errors, {
      level: 'unhandled promise',
      message: fmt(e.reason).slice(0, 2000),
    });
  });

  // --- fetch hook ---------------------------------------------------------
  // The wrapper must be indistinguishable from native fetch: some scripts
  // (e.g. Salesforce Embedded Messaging) inspect window.fetch and warn or
  // change behavior when it looks modified.
  const origFetch = window.fetch;
  const wrappedFetch = async function fetch(
    this: unknown,
    ...args: Parameters<typeof window.fetch>
  ) {
    const input = args[0];
    let url: string | undefined;
    let method = 'GET';
    try {
      url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input?.url;
      method = (
        args[1]?.method ||
        (typeof input === 'object' && input !== null && 'method' in input
          ? (input as Request).method
          : '') ||
        'GET'
      ).toUpperCase();
    } catch {
      /* never break the page */
    }
    try {
      const res = await origFetch.apply(this ?? window, args);
      try {
        if (!res.ok) {
          pushNetwork({ url, method, status: res.status, statusText: res.statusText });
        }
      } catch {
        /* never break the page */
      }
      return res;
    } catch (err) {
      try {
        pushNetwork({
          url,
          method,
          status: 0,
          statusText: `Network error: ${fmt(err).slice(0, 300)}`,
        });
      } catch {
        /* never break the page */
      }
      throw err;
    }
  };
  try {
    Object.defineProperty(wrappedFetch, 'name', { value: 'fetch', configurable: true });
    Object.defineProperty(wrappedFetch, 'length', {
      value: origFetch.length,
      configurable: true,
    });
    Object.defineProperty(wrappedFetch, 'toString', {
      value: function toString() {
        return Function.prototype.toString.call(origFetch);
      },
      writable: true,
      configurable: true,
    });
  } catch {
    /* identity polish is best-effort */
  }
  window.fetch = wrappedFetch as typeof window.fetch;

  // --- XHR hook -----------------------------------------------------------
  type CgXhr = XMLHttpRequest & { __cg?: { method: string; url: string } };
  const origOpen = XMLHttpRequest.prototype.open;
  const wrappedOpen = function open(
    this: CgXhr,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    try {
      this.__cg = { method: String(method).toUpperCase(), url: String(url) };
    } catch {
      /* never break the page */
    }
    // @ts-expect-error – passthrough of optional async/user/password args
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  const wrappedSend = function send(this: CgXhr, ...args: unknown[]) {
    try {
      this.addEventListener('loadend', () => {
        if (this.status >= 400 || this.status === 0) {
          pushNetwork({
            url: this.__cg?.url,
            method: this.__cg?.method,
            status: this.status,
            statusText:
              this.statusText || (this.status === 0 ? 'Network error / aborted' : ''),
          });
        }
      });
    } catch {
      /* never break the page */
    }
    // @ts-expect-error – passthrough
    return origSend.apply(this, args);
  };
  for (const [wrapped, orig] of [
    [wrappedOpen, origOpen],
    [wrappedSend, origSend],
  ] as const) {
    try {
      Object.defineProperty(wrapped, 'length', { value: orig.length, configurable: true });
      Object.defineProperty(wrapped, 'toString', {
        value: function toString() {
          return Function.prototype.toString.call(orig);
        },
        writable: true,
        configurable: true,
      });
    } catch {
      /* identity polish is best-effort */
    }
  }
  XMLHttpRequest.prototype.open = wrappedOpen;
  XMLHttpRequest.prototype.send = wrappedSend;
}
