const SERVER_PORT = 3001;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type PageLocation = { protocol: string; hostname: string; port?: string };
type PageLocationWithPort = PageLocation & { port: string };

/** True for addresses that only work on this computer, such as "localhost". */
export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/**
 * Where the Socket.IO server lives, checked in this order:
 * 1. VITE_SERVER_URL, if configured.
 * 2. Production build: the page's own origin, because one server serves both
 *    (e.g. https://pumpkin-stack.onrender.com).
 * 3. Development: port 3001 on the page's hostname, because Vite serves the page on 5173.
 *    A student who opens http://192.168.1.42:5173 then talks to 192.168.1.42:3001.
 */
export function resolveServerUrl(
  location: PageLocation,
  configuredUrl?: string,
  isDevServer = true
): string {
  // Trim so a stray space or trailing "/" in .env doesn't produce "http://x:3001//network".
  const cleanedUrl = configuredUrl?.trim().replace(/\/+$/, "");
  if (cleanedUrl) return cleanedUrl;
  if (!isDevServer) {
    const port = location.port ? `:${location.port}` : "";
    return `${location.protocol}//${location.hostname}${port}`;
  }
  return `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
}

/**
 * The address shown on the projector. "localhost" only works on the TA's own laptop,
 * so when the TA opened the page that way we substitute the laptop's LAN address.
 */
export function buildJoinUrl(location: PageLocationWithPort, lanAddresses: string[]): string {
  const isLoopback = isLoopbackHost(location.hostname);
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
