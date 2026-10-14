import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { listLanAddresses } from "./network.js";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return { address, internal, family: "IPv4", netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null };
}

describe("listLanAddresses", () => {
  it("returns external IPv4 addresses and skips loopback and IPv6", () => {
    // Arrange
    const interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = {
      lo0: [ipv4("127.0.0.1", true)],
      en0: [
        ipv4("192.168.1.42"),
        { address: "fe80::1", internal: false, family: "IPv6", netmask: "ffff::", mac: "00:00:00:00:00:00", cidr: null, scopeid: 0 }
      ],
      en1: undefined
    };

    // Act
    const addresses = listLanAddresses(interfaces);

    // Assert
    expect(addresses).toEqual(["192.168.1.42"]);
  });

  it("returns an empty list when the computer has no network connection", () => {
    expect(listLanAddresses({ lo0: [ipv4("127.0.0.1", true)] })).toEqual([]);
  });
});
