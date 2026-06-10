export interface ConsoleEntry {
  level: string;
  message: string;
  time: string;
}

export interface NetworkEntry {
  url?: string;
  method?: string;
  status: number;
  statusText?: string;
  /** First bytes of the failed response body (Pro: response inspector). */
  body?: string;
  time: string;
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

export const FREE_PICKS_PER_DAY = 3;
export const FREE_NETWORK_LIMIT = 5;
