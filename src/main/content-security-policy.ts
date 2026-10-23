import { isMobileConnectDevelopmentHost } from "@jargon/contracts/mobile-connect";

export function buildContentSecurityPolicy(
  packaged: boolean,
  developmentSignalUrl?: string,
  selfHostedSignalOrigin?: string | null,
): string {
  const selfHostedSignalSource = selfHostedSignalOrigin ? ` ${selfHostedSignalOrigin}` : "";
  const developmentSources = packaged
    ? ""
    : ` http://localhost:* ws://localhost:*${developmentSignalSource(developmentSignalUrl)}`;
  const developmentImageSources = packaged ? "" : " http://127.0.0.1:* http://localhost:*";

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: jargon-attachment: jargon-remote-attachment: jargon-avatar: jargon-remote-avatar: jargon-server-logo: jargon-remote-server-logo: https:${developmentImageSources}`,
    "font-src 'self' data:",
    // The lightbox plays a recording from the attachment scheme, and the preview panel plays one
    // from an object URL of the bytes that the main process sent. Neither matches `default-src`.
    "media-src 'self' blob: jargon-attachment: jargon-remote-attachment:",
    `connect-src 'self' jargon-attachment: jargon-remote-attachment: https://analytics.jargon.run ws://127.0.0.1:* wss://*.jargon.run${selfHostedSignalSource}${developmentSources}`,
    "object-src 'none'",
    // The remote desktop viewer uses a loopback proxy in packaged apps too.
    "frame-src 'self' jargon-attachment: jargon-remote-attachment: jargon-visual: jargon-remote-visual: https://*.jargon.run http://127.0.0.1:* http://localhost:*",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * The Signal origin of a self-hosted Account API. The Worker still chooses the URL in each ticket;
 * this only lets the peer window open it. It needs `JARGON_AUTH_API_URL`, because our Worker never
 * issues a ticket for another Signal.
 */
export function readSelfHostedSignalOrigin(
  authApiUrl: string | undefined,
  signalUrl: string | undefined,
): string | null {
  if (!signalUrl) return null;
  if (!authApiUrl) throw new Error("JARGON_REMOTE_SIGNAL_URL needs JARGON_AUTH_API_URL.");
  const url = new URL(signalUrl);
  if (url.protocol !== "wss:" || url.username !== "" || url.password !== "") {
    throw new Error("JARGON_REMOTE_SIGNAL_URL must be a wss: URL without credentials.");
  }
  return url.origin;
}

function developmentSignalSource(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "ws:" ||
      !isMobileConnectDevelopmentHost(url.hostname) ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return "";
    }
    return ` ${url.origin}`;
  } catch {
    return "";
  }
}
