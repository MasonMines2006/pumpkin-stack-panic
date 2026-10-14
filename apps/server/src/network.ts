import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

/**
 * Lists the IPv4 addresses other devices on the same Wi-Fi can use to reach this computer.
 * Loopback (127.0.0.1) and IPv6 are skipped because students type these addresses by hand.
 */
export function listLanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()
): string[] {
  return Object.values(interfaces)
    .flatMap(entries => entries ?? [])
    .filter(entry => entry.family === "IPv4" && !entry.internal)
    .map(entry => entry.address);
}
