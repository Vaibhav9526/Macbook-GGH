import { DEFAULT_APP_LANGUAGE } from "@jargon/contracts/app-language";
import { loadLocale, resolveLocale } from "@jargon/i18n";
import { createLazyFileRoute } from "@tanstack/solid-router";
import { createSignal, lazy, onSettled, Show } from "solid-js";
import "../../../../src/renderer/src/preview/preview.css";

// The demo follows the visitor's language. Its catalogs load with the code, so the demo does not
// start in English; if they fail, the demo shows English.
const JargonPlayground = lazy(() =>
  Promise.all([
    import("@jargon/renderer-preview"),
    loadLocale(resolveLocale(DEFAULT_APP_LANGUAGE, navigator.language)).catch(() => undefined),
  ]).then(([module]) => ({ default: module.JargonPlayground })),
);

export const Route = createLazyFileRoute("/app-preview")({ component: AppPreviewPage });

export function AppPreviewPage() {
  const [mounted, setMounted] = createSignal(false);
  onSettled(() => {
    setMounted(true);
  });

  return (
    <div id="root" class="jargon-playground-root" data-preview-variant="landing">
      <Show
        when={mounted()}
        fallback={<div class="jargon-playground-loading" role="status" aria-label="Loading Jargon preview" />}
      >
        <JargonPlayground variant="landing" />
      </Show>
    </div>
  );
}
