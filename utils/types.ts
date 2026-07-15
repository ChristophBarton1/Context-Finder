export interface ConsoleEntry {
  level: string;
  message: string;
  time: string;
  /** Host of the frame this came from (top frame, or a child iframe). */
  origin?: string;
}

export interface NetworkEntry {
  url?: string;
  method?: string;
  status: number;
  statusText?: string;
  /** First bytes of the failed response body (Pro: response inspector). */
  body?: string;
  time: string;
  /** Host of the frame that issued the request. */
  origin?: string;
}

export interface CaptureStore {
  errors: ConsoleEntry[];
  network: NetworkEntry[];
}

export interface PageInfo {
  url: string;
  title: string;
  viewport: string;
  userAgent: string;
  /** Detected frameworks/CMS, e.g. ["WordPress", "Elementor"]. */
  stack?: string[];
}

export interface CaptureData extends CaptureStore {
  page: PageInfo;
}

export interface PickedElement {
  selector: string;
  html: string;
  styles: Record<string, string>;
  time: string;
}

// Generous on purpose: the picker is the free tier's wow moment and word-of-
// mouth engine; Pro's anchor is the response inspector, not this limit.
export const FREE_PICKS_PER_DAY = 10;
export const FREE_NETWORK_LIMIT = 5;
