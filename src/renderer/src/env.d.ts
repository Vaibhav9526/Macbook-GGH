/// <reference types="vite/client" />

import type { JargonDesktopApi } from "@jargon/contracts/ipc";

declare global {
  interface HighlightRegistry {
    set(name: string, highlight: Highlight): this;
    delete(name: string): boolean;
  }

  interface Window {
    jargon: JargonDesktopApi;
  }
}
