import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createGameServer, type RunningGameServer } from "./socket-server.js";

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

function request<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return socket.timeout(1_000).emitWithAck(event, payload);
}

describe("socket game server", () => {
  let server: RunningGameServer | undefined;
  const clients: Socket[] = [];

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await server?.close();
  });

  it("keeps two players synchronized through a pumpkin transfer", async () => {
    server = await createGameServer({
      port: 0,
      commandDelayMs: 5,
      roundDurationMs: 2_000,
      stackSize: 2,
      random: () => 0
    });
    const first = createClient(server.url);
    const second = createClient(server.url);
    const third = createClient(server.url);
    clients.push(first, second, third);

    const created = await request<{ code: string }>(first, "room:create", {
      name: "Mason"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = await request(second, "room:join", {
      code: created.data.code,
      name: "Esha"
    });
    expect(joined.ok).toBe(true);
    const thirdJoined = await request(third, "room:join", {
      code: created.data.code,
      name: "Greg"
    });
    expect(thirdJoined.ok).toBe(true);

    const started = await request(first, "game:start", {
      code: created.data.code,
      mode: "PVP"
    });
    expect(started.ok).toBe(true);

    const updated = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No synchronized state")), 500);
      third.on("game:state", state => {
        const players = Object.values(state.game.players) as Array<{ name: string; stack: number[] }>;
        const esha = players.find(player => player.name === "Esha");
        const greg = players.find(player => player.name === "Greg");
        if (esha?.stack.length === 1 && greg?.stack.length === 3) {
          clearTimeout(timeout);
          resolve(state);
        }
      });
    });
    const action = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No animation action")), 500);
      third.on("game:action", event => {
        if (event.command === "SEND_TOP") {
          clearTimeout(timeout);
          resolve(event);
        }
      });
    });

    const submitted = await request(second, "program:submit", {
      code: created.data.code,
      commands: [{ type: "SEND_TOP" }]
    });
    expect(submitted.ok).toBe(true);
    await expect(updated).resolves.toBeTruthy();
    await expect(action).resolves.toMatchObject({ command: "SEND_TOP" });
  });

  it("returns useful errors for malformed and unauthorized requests", async () => {
    server = await createGameServer({ port: 0, roundDurationMs: 1_000 });
    const first = createClient(server.url);
    const second = createClient(server.url);
    clients.push(first, second);

    const badCreate = await request(first, "room:create", { name: "" });
    expect(badCreate.ok).toBe(false);
    const wrongType = await request(first, "room:create", { name: 42 });
    expect(wrongType.ok).toBe(false);

    const created = await request<{ code: string }>(first, "room:create", { name: "Mason" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const missing = await request(second, "room:join", { code: "NOPE", name: "Esha" });
    expect(missing.ok).toBe(false);
    const joined = await request(second, "room:join", { code: created.data.code, name: "Esha" });
    expect(joined.ok).toBe(true);

    const notHost = await request(second, "game:start", { code: created.data.code, mode: "PVP" });
    expect(notHost.ok).toBe(false);
    const malformedStart = await request(first, "game:start", { code: created.data.code, mode: "NOPE" });
    expect(malformedStart.ok).toBe(false);

    const emptyProgram = await request(first, "program:submit", { code: created.data.code, commands: [] });
    expect(emptyProgram.ok).toBe(false);
    const wrongRoom = await request(first, "program:submit", {
      code: "NOPE",
      commands: [{ type: "PEEK_TOP" }]
    });
    expect(wrongRoom.ok).toBe(false);
  });

  it("keeps separate classroom lobbies isolated", async () => {
    server = await createGameServer({ port: 0, commandDelayMs: 5, roundDurationMs: 1_000, stackSize: 2 });
    const hostA = createClient(server.url);
    const playerA = createClient(server.url);
    const hostB = createClient(server.url);
    const playerB = createClient(server.url);
    clients.push(hostA, playerA, hostB, playerB);

    const createdA = await request<{ code: string }>(hostA, "room:create", { name: "TA A" });
    const createdB = await request<{ code: string }>(hostB, "room:create", { name: "TA B" });
    expect(createdA.ok && createdB.ok).toBe(true);
    if (!createdA.ok || !createdB.ok) return;
    await request(playerA, "room:join", { code: createdA.data.code, name: "Alice" });
    await request(playerB, "room:join", { code: createdB.data.code, name: "Bob" });

    const foreignEvents: unknown[] = [];
    playerB.on("game:state", event => foreignEvents.push(event));
    playerB.on("game:action", event => foreignEvents.push(event));
    await request(hostA, "game:start", { code: createdA.data.code, mode: "PVE" });
    await request(playerA, "program:submit", {
      code: createdA.data.code,
      commands: [{ type: "SEND_TOP" }]
    });
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(foreignEvents).toEqual([]);
  });

  it("rejects a second program while the first is still running", async () => {
    server = await createGameServer({ port: 0, commandDelayMs: 50, roundDurationMs: 2_000, stackSize: 4 });
    const host = createClient(server.url);
    const player = createClient(server.url);
    clients.push(host, player);
    const created = await request<{ code: string }>(host, "room:create", { name: "TA" });
    if (!created.ok) throw new Error(created.error);
    await request(player, "room:join", { code: created.data.code, name: "Spammer" });
    await request(host, "game:start", { code: created.data.code, mode: "PVP" });
    const program = { code: created.data.code, commands: [{ type: "PEEK_TOP" }, { type: "PEEK_TOP" }] };

    const first = await request(player, "program:submit", program);
    const second = await request(player, "program:submit", program);

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: "Your program is still running" });

    // Once the first program finishes (2 × 50 ms), the player may submit again.
    await new Promise(resolve => setTimeout(resolve, 200));
    const third = await request(player, "program:submit", program);
    expect(third.ok).toBe(true);
  });

  it("closes a room when its TA stays disconnected past the grace period", async () => {
    server = await createGameServer({ port: 0, hostGraceMs: 50 });
    const host = createClient(server.url);
    const player = createClient(server.url);
    clients.push(host, player);
    const created = await request<{ code: string }>(host, "room:create", { name: "TA" });
    if (!created.ok) throw new Error(created.error);
    await request(player, "room:join", { code: created.data.code, name: "Student" });
    const closed = new Promise<string>(resolve => player.on("room:closed", resolve));

    host.disconnect();

    await expect(closed).resolves.toMatch(/closed/i);
    const rejoin = await request(createClient(server.url), "room:join", { code: created.data.code, name: "Late" });
    expect(rejoin).toEqual({ ok: false, error: "Room not found" });
  });

  it("closes the TA's old room when the same TA creates a new one", async () => {
    server = await createGameServer({ port: 0 });
    const host = createClient(server.url);
    const player = createClient(server.url);
    clients.push(host, player);
    const first = await request<{ code: string }>(host, "room:create", { name: "TA" });
    if (!first.ok) throw new Error(first.error);
    await request(player, "room:join", { code: first.data.code, name: "Student" });
    const closed = new Promise<string>(resolve => player.on("room:closed", resolve));

    await request(host, "room:create", { name: "TA" });

    await expect(closed).resolves.toMatch(/closed/i);
  });

  it("serves the built client from the same address as the game in production", async () => {
    // Arrange: a fake "built client" folder with one page in it.
    const clientDir = mkdtempSync(join(tmpdir(), "pumpkin-client-"));
    writeFileSync(join(clientDir, "index.html"), "<h1>Pumpkin Stack Panic</h1>");
    server = await createGameServer({ port: 0, clientDir, exposeNetworkInfo: false });

    // Act
    const page = await fetch(`${server.url}/`);
    const health = await fetch(`${server.url}/health`);
    const network = await fetch(`${server.url}/network`);

    // Assert
    expect(await page.text()).toContain("Pumpkin Stack Panic");
    expect(health.status).toBe(200);
    expect(network.status).toBe(404); // LAN details are pointless (and private) on a public host.
  });
});

