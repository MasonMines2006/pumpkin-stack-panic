import { describe, expect, it } from "vitest";
import { buildJoinUrl, parseLanAddresses, resolveServerUrl } from "./connection.js";

describe("resolveServerUrl", () => {
  it("uses an explicit VITE_SERVER_URL when one is configured", () => {
    expect(resolveServerUrl({ protocol: "http:", hostname: "192.168.1.42" }, "http://10.0.0.5:4000"))
      .toBe("http://10.0.0.5:4000");
  });

  it("points at port 3001 on whatever address the page was loaded from", () => {
    expect(resolveServerUrl({ protocol: "http:", hostname: "192.168.1.42" })).toBe("http://192.168.1.42:3001");
  });

  it("ignores a blank VITE_SERVER_URL and trims a trailing slash", () => {
    const page = { protocol: "http:", hostname: "192.168.1.42" };
    expect(resolveServerUrl(page, "   ")).toBe("http://192.168.1.42:3001");
    expect(resolveServerUrl(page, " http://10.0.0.5:4000/ ")).toBe("http://10.0.0.5:4000");
  });

  it("keeps working on the development computer", () => {
    expect(resolveServerUrl({ protocol: "http:", hostname: "localhost" })).toBe("http://localhost:3001");
  });
});

describe("buildJoinUrl", () => {
  it("shows the page's own address when the TA opened the LAN URL", () => {
    expect(buildJoinUrl({ protocol: "http:", hostname: "192.168.1.42", port: "5173" }, [])).toBe("http://192.168.1.42:5173");
  });

  it("swaps localhost for the first LAN address so students can reach it", () => {
    expect(buildJoinUrl({ protocol: "http:", hostname: "localhost", port: "5173" }, ["192.168.1.42", "10.0.0.7"]))
      .toBe("http://192.168.1.42:5173");
  });

  it("falls back to localhost when no LAN address is known", () => {
    expect(buildJoinUrl({ protocol: "http:", hostname: "127.0.0.1", port: "5173" }, [])).toBe("http://127.0.0.1:5173");
  });

  it("omits the port when the page uses the default port", () => {
    expect(buildJoinUrl({ protocol: "https:", hostname: "pumpkins.example.edu", port: "" }, [])).toBe("https://pumpkins.example.edu");
  });
});

describe("parseLanAddresses", () => {
  it("accepts the server's { lanAddresses: string[] } reply", () => {
    expect(parseLanAddresses({ lanAddresses: ["192.168.1.42"] })).toEqual(["192.168.1.42"]);
  });

  it("returns an empty list for any other shape instead of crashing the lobby", () => {
    expect(parseLanAddresses({})).toEqual([]);
    expect(parseLanAddresses(null)).toEqual([]);
    expect(parseLanAddresses({ lanAddresses: "192.168.1.42" })).toEqual([]);
    expect(parseLanAddresses({ lanAddresses: [42] })).toEqual([]);
  });
});
