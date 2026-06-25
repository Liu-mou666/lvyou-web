/** Playwright 为可选依赖，未安装时仅 playwright 模式不可用 */
declare module "playwright" {
  export interface PlaywrightPage {
    goto: (url: string, opts?: Record<string, unknown>) => Promise<void>;
    waitForTimeout: (ms: number) => Promise<void>;
    content: () => Promise<string>;
    addInitScript: (fn: () => void) => Promise<void>;
    on: (event: string, handler: (arg: PlaywrightResponse) => void) => void;
    off: (event: string, handler: (arg: PlaywrightResponse) => void) => void;
    evaluate: <T, A = unknown>(fn: (arg: A) => T | Promise<T>, arg?: A) => Promise<T>;
    locator: (sel: string) => { innerText: () => Promise<string> };
  }

  export interface PlaywrightResponse {
    url: () => string;
    ok: () => boolean;
    json: () => Promise<unknown>;
  }

  export interface PlaywrightContext {
    pages: () => PlaywrightPage[];
    newPage: () => Promise<PlaywrightPage>;
    cookies: (url?: string) => Promise<Array<{ name: string; value: string }>>;
    close: () => Promise<void>;
  }

  export const chromium: {
    launch: (opts?: {
      headless?: boolean;
      args?: string[];
    }) => Promise<{
      newContext: (opts?: Record<string, unknown>) => Promise<PlaywrightContext>;
      newPage: (opts?: Record<string, unknown>) => Promise<PlaywrightPage>;
      close: () => Promise<void>;
    }>;
    launchPersistentContext: (
      userDataDir: string,
      opts?: Record<string, unknown>,
    ) => Promise<PlaywrightContext>;
  };
}
