import { describe, expect, it } from "vitest";
import {
  calculatePveResult,
  calculatePvpRanking,
  createPumpkinStack,
  executeCommand,
  type GameState,
  type PlayerState
} from "./game.js";

function player(id: string, stack: number[], queue: number[] = []): PlayerState {
  return {
    id,
    name: id,
    connected: true,
    stack,
    queue,
    program: [],
    commandIndex: 0
  };
}

function game(mode: "PVP" | "PVE"): GameState {
  return {
    mode,
    phase: "PLAYING",
    players: {
      a: player("a", [5, -3]),
      b: player("b", [2])
    },
    witchStack: mode === "PVE" ? [1] : [],
    witchHealth: 100,
    roundEndsAt: 10_000
  };
}

describe("createPumpkinStack", () => {
  it("creates the requested number of pumpkins in the -5 to 5 range", () => {
    const values = [0, 0.5, 0.999];
    let index = 0;

    const stack = createPumpkinStack(3, () => values[index++] ?? 0);

    expect(stack).toEqual([-5, 0, 5]);
  });

  it("rejects invalid stack sizes", () => {
    expect(() => createPumpkinStack(-1)).toThrow("Stack size");
    expect(() => createPumpkinStack(101)).toThrow("Stack size");
  });
});

describe("executeCommand", () => {
  it("moves only the top pumpkin from the stack into the queue", () => {
    const next = executeCommand(game("PVP"), "a", { type: "POP_TO_QUEUE" });

    expect(next.players.a?.stack).toEqual([5]);
    expect(next.players.a?.queue).toEqual([-3]);
  });

  it("moves the front pumpkin from the queue to the top of the stack", () => {
    const state = game("PVP");
    state.players.a = player("a", [5], [-3, 2]);

    const next = executeCommand(state, "a", { type: "DEQUEUE_TO_STACK" });

    expect(next.players.a?.stack).toEqual([5, -3]);
    expect(next.players.a?.queue).toEqual([2]);
  });

  it("supports Java-like removal, queue inspection, rotation, and sorting", () => {
    const state = game("PVP");
    state.players.a = player("a", [4, -3, 2], [-5, 3]);

    const popped = executeCommand(state, "a", { type: "POP_TOP" });
    expect(popped.players.a?.stack).toEqual([4, -3]);

    const inspected = executeCommand(state, "a", { type: "PEEK_QUEUE" });
    expect(inspected.players.a?.queue).toEqual([-5, 3]);

    const rotated = executeCommand(state, "a", { type: "ROTATE_QUEUE" });
    expect(rotated.players.a?.queue).toEqual([3, -5]);

    const sorted = executeCommand(state, "a", { type: "SORT_STACK" });
    expect(sorted.players.a?.stack).toEqual([-3, 2, 4]);
  });

  it("sends the top pumpkin to a random opponent in PVP", () => {
    const next = executeCommand(
      game("PVP"),
      "a",
      { type: "SEND_TOP" },
      () => 0
    );

    expect(next.players.a?.stack).toEqual([5]);
    expect(next.players.b?.stack).toEqual([2, -3]);
  });

  it("sends the top pumpkin to the witch in PVE", () => {
    const next = executeCommand(game("PVE"), "a", { type: "SEND_TOP" });

    expect(next.players.a?.stack).toEqual([5]);
    expect(next.witchStack).toEqual([1, -3]);
    expect(next.witchHealth).toBe(94);
  });

  it("caps witch healing at full health", () => {
    const state = game("PVE");
    state.players.a = player("a", [5]);
    state.witchHealth = 98;

    const next = executeCommand(state, "a", { type: "SEND_TOP" });

    expect(next.witchHealth).toBe(100);
  });

  it("rejects operations that cannot be performed", () => {
    const state = game("PVP");
    state.players.a = player("a", []);

    expect(() =>
      executeCommand(state, "a", { type: "POP_TO_QUEUE" })
    ).toThrow("empty stack");
    expect(() =>
      executeCommand(state, "a", { type: "SEND_TOP" })
    ).toThrow("empty stack");
    expect(() => executeCommand(state, "a", { type: "POP_TOP" })).toThrow("empty stack");
  });

  it("rejects commands outside a round and from unknown players", () => {
    const state = game("PVP");
    state.phase = "LOBBY";
    expect(() => executeCommand(state, "a", { type: "PEEK_TOP" })).toThrow(
      "during a round"
    );
    state.phase = "PLAYING";
    expect(() => executeCommand(state, "missing", { type: "PEEK_TOP" })).toThrow(
      "Player not found"
    );
  });

  it("rejects an empty queue and PVP play without an opponent", () => {
    const state = game("PVP");
    expect(() => executeCommand(state, "a", { type: "DEQUEUE_TO_STACK" })).toThrow(
      "empty queue"
    );
    expect(() => executeCommand(state, "a", { type: "ROTATE_QUEUE" })).toThrow(
      "empty queue"
    );
    delete state.players.b;
    expect(() => executeCommand(state, "a", { type: "SEND_TOP" })).toThrow(
      "No connected opponent"
    );
  });
});

describe("scoring", () => {
  it("ranks PVP players by descending stack total", () => {
    const state = game("PVP");
    state.players.a = player("a", [5, -3]);
    state.players.b = player("b", [4, 2]);

    expect(calculatePvpRanking(state)).toEqual([
      { playerId: "b", name: "b", score: 6 },
      { playerId: "a", name: "a", score: 2 }
    ]);
  });

  it("multiplies the witch stack by the player count in PVE", () => {
    const state = game("PVE");
    state.players.a = player("a", [5, -1]);
    state.players.b = player("b", [2]);
    state.witchStack = [2, -1];

    expect(calculatePveResult(state)).toEqual({
      classScore: 6,
      witchScore: 2,
      classWon: true
    });
  });

  it("reports when the witch wins", () => {
    const state = game("PVE");
    state.witchStack = [5];
    state.players.a = player("a", [-5]);
    state.players.b = player("b", [-5]);
    expect(calculatePveResult(state).classWon).toBe(false);
  });
});
