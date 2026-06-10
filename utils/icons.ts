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

export const TARGET_ICONS: Record<string, BrandIcon> = {
  claude: { path: siClaude.path, color: `#${siClaude.hex}` },
  chatgpt: { monogram: 'G', color: '#10A37F' },
  'claude-code': { path: siAnthropic.path },
  'codex-cli': { monogram: '>_' },
  cursor: { path: siCursor.path },
  windsurf: { path: siWindsurf.path, color: `#${siWindsurf.hex}` },
  gemini: { path: siGooglegemini.path, color: `#${siGooglegemini.hex}` },
  grok: { path: siX.path },
  github: { path: siGithub.path },
  client: { monogram: '@' },
  developer: { monogram: '</>' },
};

export const STACK_ICONS: Record<string, BrandIcon> = {
  WordPress: { path: siWordpress.path, color: `#${siWordpress.hex}` },
  Elementor: { path: siElementor.path, color: `#${siElementor.hex}` },
  WooCommerce: { path: siWoocommerce.path, color: `#${siWoocommerce.hex}` },
  Shopify: { path: siShopify.path, color: `#${siShopify.hex}` },
  React: { path: siReact.path, color: `#${siReact.hex}` },
  Vue: { path: siVuedotjs.path, color: `#${siVuedotjs.hex}` },
  Svelte: { path: siSvelte.path, color: `#${siSvelte.hex}` },
  Angular: { path: siAngular.path, color: `#${siAngular.hex}` },
  'Next.js': { path: siNextdotjs.path },
};
