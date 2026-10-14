import { useEffect, useState } from "react";
import { buildJoinUrl, parseLanAddresses } from "./connection.js";
import { serverUrl } from "./socket.js";

/**
 * Returns the address students should type, e.g. "http://192.168.1.42:5173".
 * Pass isEnabled = false on student screens: only the TA's projector shows this,
 * and hooks can't be skipped conditionally, so the condition lives inside the effect.
 */
export function useJoinUrl(isEnabled: boolean): string {
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);

  useEffect(() => {
    if (!isEnabled) return;
    // Cancels the request if the lobby closes (e.g. the game starts) before it answers.
    const controller = new AbortController();
    fetch(`${serverUrl}/network`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Server answered ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(body => setLanAddresses(parseLanAddresses(body)))
      .catch((error: unknown) => {
        // An abort is us cleaning up, not a real failure, so don't warn about it.
        if (!controller.signal.aborted) console.warn("Could not look up the LAN join address", error);
      });
    return () => controller.abort();
  }, [isEnabled]);

  return buildJoinUrl(window.location, lanAddresses);
}
