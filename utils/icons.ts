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
  /** 24×24 SVG path (simple-icons). */
  path?: string;
  /** Fill color; omitted = currentColor (adapts to theme). */
  color?: string;
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
  // OpenAI had its marks removed from simple-icons (trademark request) –
  // no icon is more professional than a fake one.
  chatgpt: {},
  'claude-code': icon(siAnthropic),
  'codex-cli': {},
  cursor: icon(siCursor),
  windsurf: icon(siWindsurf),
  gemini: icon(siGooglegemini),
  grok: icon(siX),
  github: icon(siGithub),
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
