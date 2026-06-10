/**
 * Known ad/analytics endpoints. Requests to these fail all the time
 * (ad blockers, consent tools) without breaking anything – they should
 * never be presented as "problems" or pollute the AI report.
 */
const TRACKER_HOSTS = [
  'px.ads.linkedin.com',
  'ads.linkedin.com',
  'snap.licdn.com',
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'google.com/ccm',
  'google.com/pagead',
  'google.com/ads',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'connect.facebook.net',
  'facebook.com/tr',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'bat.bing.com',
  'clarity.ms',
  'hotjar.com',
  'hotjar.io',
  'sentry.io',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'plausible.io',
  'matomo.cloud',
  'cdn.cookielaw.org',
  'consensu.org',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'adsrvr.org',
  'amazon-adsystem.com',
  // visitor counters
  'webhosting.luminate.com',
  'statcounter.com',
];

export function isTracker(url: string | undefined): boolean {
  if (!url) return false;
  let host: string;
  let path: string;
  try {
    const u = new URL(url);
    host = u.host.toLowerCase();
    path = u.pathname;
  } catch {
    return false;
  }
  return TRACKER_HOSTS.some((t) => {
    if (t.includes('/')) {
      const [tHost, tPath] = t.split('/');
      return (host === tHost || host.endsWith('.' + tHost)) && path.startsWith('/' + tPath);
    }
    return host === t || host.endsWith('.' + t);
  });
}
