const SERVER_PORT = 3001;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type PageLocation = { protocol: string; hostname: string };
type PageLocationWithPort = PageLocation & { port: string };

/**
 * The game server runs on the same computer that serves this page, so reuse the page's
 * hostname. A student who opens http://192.168.1.42:5173 then talks to 192.168.1.42:3001.
 * VITE_SERVER_URL still wins when the server lives somewhere else.
 */
export function resolveServerUrl(location: PageLocation, configuredUrl?: string): string {
  // Trim so a stray space or trailing "/" in .env doesn't produce "http://x:3001//network".
  const cleanedUrl = configuredUrl?.trim().replace(/\/+$/, "");
  if (cleanedUrl) return cleanedUrl;
  return `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
}

/**
 * The address shown on the projector. "localhost" only works on the TA's own laptop,
 * so when the TA opened the page that way we substitute the laptop's LAN address.
 */
export function buildJoinUrl(location: PageLocationWithPort, lanAddresses: string[]): string {
  const isLoopback = LOOPBACK_HOSTS.has(location.hostname);
  const hostname = isLoopback && lanAddresses.length > 0 ? lanAddresses[0] : location.hostname;
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${hostname}${port}`;
}

/**
 * The /network reply comes over the network, so TypeScript can't promise its shape.
 * Anything unexpected becomes [] (the lobby then just shows the page's own address)
 * instead of an undefined value that would crash rendering.
 */
export function parseLanAddresses(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("lanAddresses" in body)) return [];
  const { lanAddresses } = body;
  const isStringList = Array.isArray(lanAddresses) && lanAddresses.every(item => typeof item === "string");
  return isStringList ? lanAddresses : [];
}
