/**
 * Brand icons for export targets and detected frameworks.
 *
 * SVG paths come from the simple-icons project (CC0). Icons whose brand
 * color is near-black (GitHub, X/Grok, Anthropic) or that were removed from
 * simple-icons after trademark requests (OpenAI/ChatGPT, Codex) fall back to
 * `currentColor` fills or a monogram so they stay visible in dark mode.
 */
import {
  siClaude,
  siAnthropic,
  siGooglegemini,
  siGithub,
  siX,
  siCursor,
  siWindsurf,
  siReplit,
  siV0,
  siWordpress,
  siElementor,
  siWoocommerce,
  siShopify,
  siReact,
  siVuedotjs,
  siSvelte,
  siAngular,
  siNextdotjs,
} from 'simple-icons';

export interface BrandIcon {
  /** SVG path (24×24 viewBox unless `viewBox` overrides). */
  path?: string;
  /** viewBox override for paths whose source isn't 24×24. */
  viewBox?: string;
  /** Fill color; omitted = currentColor (adapts to theme). */
  color?: string;
  /** 'evenodd' for paths with counters/holes (e.g. a glyph); default nonzero. */
  fillRule?: 'evenodd' | 'nonzero';
  /** Fallback when no usable brand path exists. */
  monogram?: string;
}

/**
 * Brand colors that are too dark for a dark popup (GitHub black, X black,
 * Anthropic near-black, Windsurf near-black …) fall back to currentColor so
 * the mark stays clearly visible in both themes.
 */
function visibleColor(hex: string): string | undefined {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 80 ? undefined : `#${hex}`;
}

const icon = (si: { path: string; hex: string }): BrandIcon => ({
  path: si.path,
  color: visibleColor(si.hex),
});

export const TARGET_ICONS: Record<string, BrandIcon> = {
  claude: icon(siClaude),
  // Real OpenAI "blossom" mark (svgl.app, viewBox 256×260). No color → adapts
  // to light/dark like the other near-black marks.
  chatgpt: {
    path: 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z',
    viewBox: '0 0 256 260',
  },
  'claude-code': icon(siAnthropic),
  // OpenAI removed its marks from simple-icons (trademark); a terminal-prompt
  // monogram reads as "CLI" and stays visible in both themes.
  'codex-cli': { monogram: '>_' },
  cursor: icon(siCursor),
  windsurf: icon(siWindsurf),
  gemini: icon(siGooglegemini),
  grok: icon(siX),
  github: icon(siGithub),
  // Real brand marks (Lovable silhouette from its favicon; Bolt "b" glyph and
  // Base44 mark from official sources). The owner wants a real logo beside
  // every target name; monograms remain only as a last-resort fallback.
  lovable: {
    path: 'M36.069 0c19.92 0 36.068 16.155 36.068 36.084v13.713h12.004c19.92 0 36.069 16.156 36.069 36.084 0 19.928-16.149 36.083-36.069 36.083H0v-85.88C0 16.155 16.148 0 36.069 0Z',
    viewBox: '0 0 121 122',
    color: '#1E52F1',
  },
  bolt: {
    path: 'M8.64368 11.7731C7.91976 11.7731 7.20901 11.5147 6.80099 10.9591L6.65707 11.6143L4 13L4.28684 11.6143L6.22186 3H8.59103L7.9066 6.03634C8.45941 5.44199 8.97273 5.22234 9.63083 5.22234C11.0523 5.22234 12 6.1397 12 7.81938C12 9.55074 10.9076 11.7731 8.64368 11.7731ZM9.55186 8.31036C9.55186 9.11144 8.97273 9.71871 8.22249 9.71871C7.8013 9.71871 7.4196 9.56366 7.16952 9.29233L7.53806 7.70309C7.81447 7.43176 8.13036 7.27671 8.49889 7.27671C9.06486 7.27671 9.55186 7.69017 9.55186 8.31036Z',
    viewBox: '0 0 16 16',
    fillRule: 'evenodd',
  },
  replit: icon(siReplit),
  v0: icon(siV0),
  base44: {
    path: 'M236.95 263.861C237.341 263.861 237.513 264.358 237.201 264.596C212.348 283.664 181.247 295 147.5 295C113.752 295 82.6518 283.667 57.7981 264.596C57.4867 264.358 57.6588 263.861 58.0494 263.861H236.953H236.95ZM275.426 220.977C270.274 229.928 264.208 238.286 257.36 245.926C257.1 246.216 256.729 246.38 256.341 246.38H38.6614C38.2735 246.38 37.902 246.216 37.6425 245.926C30.792 238.286 24.7281 229.928 19.5765 220.977C19.3662 220.614 19.6312 220.158 20.0518 220.158H274.95C275.371 220.158 275.636 220.614 275.426 220.977ZM292.082 176.836C290.329 185.52 287.813 193.927 284.609 201.988C284.442 202.403 284.038 202.676 283.59 202.676H11.4094C10.9615 202.676 10.5572 202.403 10.3906 201.988C7.18657 193.93 4.67088 185.522 2.91727 176.836C2.84899 176.498 3.10848 176.181 3.45537 176.181H291.544C291.888 176.181 292.151 176.498 292.082 176.836ZM146.503 0.00328822C228.422 -0.537544 294.999 65.7062 294.999 147.5C294.999 151.095 294.871 154.659 294.62 158.191C294.601 158.478 294.36 158.699 294.073 158.699H0.928759C0.641954 158.699 0.401584 158.478 0.382464 158.191C0.131168 154.706 0.00278846 151.185 5.69817e-05 147.634C-0.0709614 67.3806 66.252 0.535926 146.503 0.00328822Z',
    viewBox: '0 0 295 295',
    color: '#FF983B',
  },
  client: { monogram: '@' },
  developer: { monogram: '</>' },
};

export const STACK_ICONS: Record<string, BrandIcon> = {
  WordPress: icon(siWordpress),
  Elementor: icon(siElementor),
  WooCommerce: icon(siWoocommerce),
  Shopify: icon(siShopify),
  React: icon(siReact),
  Vue: icon(siVuedotjs),
  Svelte: icon(siSvelte),
  Angular: icon(siAngular),
  'Next.js': icon(siNextdotjs),
};
