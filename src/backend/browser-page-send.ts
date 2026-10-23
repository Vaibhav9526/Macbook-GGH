// Types one message into the page of a tab and clicks its send control. Only the School's @teach-me
// uses it, and only on the OpenMAIC page. The script is fixed here; the caller supplies only the text,
// which is passed as a JSON string literal.

import type { BrowserPageSendResult } from "@jargon/contracts/ipc";

/** The one page a School send may write to. The host refuses every other origin. */
export const PAGE_SEND_ORIGIN = "https://open.maic.chat";

/** The attribute the script puts on the send button, so the host can click it with a real mouse event. */
export const PAGE_SEND_MARK = "data-jargon-send";

/** How long the page may take to show its message box, after the tab has finished its own load. */
export const PAGE_SEND_TIMEOUT_MS = 30_000;

/**
 * Finds the first visible textarea or contenteditable and types the text into it. The send control of the
 * OpenMAIC composer is a submit button under the box, and it is disabled until the box has text, so the script
 * waits for it to enable. If no submit button is found below the box, it falls back to a visible button whose
 * text, aria-label or title contains "send" or "start". The script returns a result name; it never throws.
 */
export function buildPageSendScript(text: string): string {
  return `(async () => {
  const text = ${JSON.stringify(text)};
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const findInput = () =>
    [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].find(visible);
  const deadline = Date.now() + ${PAGE_SEND_TIMEOUT_MS};
  let input = findInput();
  while (!input && Date.now() < deadline) {
    await pause(250);
    input = findInput();
  }
  if (!input) return "input-not-found";
  input.focus();
  if (input instanceof HTMLTextAreaElement) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setValue.call(input, text);
  } else {
    input.textContent = text;
  }
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const label = (el) =>
    ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "")).toLowerCase();
  // The composer's send button: a submit button at or below the top of the box, the lowest and rightmost first.
  const composerSubmit = () =>
    [...document.querySelectorAll("button")]
      .filter((el) => visible(el) && el.type === "submit" && el.getBoundingClientRect().top >= input.getBoundingClientRect().top)
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.top - ra.top || rb.left - ra.left;
      })[0];
  const labelled = () =>
    [...document.querySelectorAll('button, [role="button"], input[type="submit"]')]
      .filter((el) => visible(el) && /send|start/.test(label(el)))[0];
  let button = null;
  const waitUntil = Date.now() + 3000;
  while (Date.now() < waitUntil) {
    button = composerSubmit() ?? labelled() ?? null;
    if (button && !button.disabled) break;
    await pause(150);
  }
  if (!button || button.disabled) return "send-not-found";
  // A real mouse click is made by the host: a synthetic element.click() does not start the page's send.
  button.setAttribute("${PAGE_SEND_MARK}", "1");
  return "sent";
})()`;
}

/** Reads the script's answer. Anything other than the three known names is a failed page, not a guess. */
export function pageSendResult(value: unknown): BrowserPageSendResult {
  if (value === "sent" || value === "input-not-found" || value === "send-not-found") return value;
  throw new Error("Browser page send returned an unknown result.");
}
