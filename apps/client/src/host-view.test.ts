import { describe, expect, it } from "vitest";
import type { GameAction, GameState } from "@pumpkin/shared";
import { createAttackRoute, createHostViewModel, getMageAvatar, getMiniCollection } from "./host-view.js";

const state: GameState = {
  mode: "PVE",
  phase: "PLAYING",
  roundEndsAt: 50_000,
  witchStack: [-3, 2],
  witchHealth: 72,
  players: {
    b: {
      id: "b", name: "Esha", connected: true, stack: [5, -1], queue: [2],
      program: [{ type: "SEND_TOP" }], commandIndex: 0
    },
    a: {
      id: "a", name: "Mason", connected: true, stack: [3], queue: [],
      program: [], commandIndex: 0
    }
  }
};

describe("createHostViewModel", () => {
  it("creates alphabetized projection cards with live game details", () => {
    const view = createHostViewModel(state);

    expect(view.players.map(player => player.name)).toEqual(["Esha", "Mason"]);
    expect(view.players[0]).toMatchObject({
      score: 4,
      stack: [5, -1],
      queue: [2],
      commandProgress: "0 / 1"
    });
  });

  it("includes prominent PVE boss health", () => {
    const view = createHostViewModel(state);

    expect(view.boss).toEqual({ health: 72, maxHealth: 100, multiplier: 2 });
  });

  it("omits the boss in PVP", () => {
    expect(createHostViewModel({ ...state, mode: "PVP" }).boss).toBeNull();
  });
});

describe("getMageAvatar", () => {
  it("assigns the same magical animal whenever a player reconnects", () => {
    expect(getMageAvatar("student-42")).toEqual(getMageAvatar("student-42"));
  });

  it("returns one of the five academy animals with a usable sprite position", () => {
    const avatar = getMageAvatar("student-17");

    expect(["Cat", "Fox", "Owl", "Frog", "Rabbit"]).toContain(avatar.name);
    expect(avatar.spritePosition).toMatch(/^\d+%$/);
  });
});

describe("createAttackRoute", () => {
  it("routes PVP attacks from one player board to the targeted opponent", () => {
    const action: GameAction = {
      id: "attack-1", command: "SEND_TOP", actorId: "a", targetId: "b", value: -4
    };

    expect(createAttackRoute(action)).toEqual({ sourceId: "a", targetId: "b", value: -4 });
  });

  it("routes cooperative attacks to the witch", () => {
    const action: GameAction = {
      id: "attack-2", command: "SEND_TOP", actorId: "a", target: "WITCH", value: -3
    };

    expect(createAttackRoute(action)).toEqual({ sourceId: "a", targetId: "WITCH", value: -3 });
  });

  it("ignores stack operations that do not attack another character", () => {
    expect(createAttackRoute({ id: "peek", command: "PEEK_TOP", actorId: "a" })).toBeNull();
  });
});

describe("getMiniCollection", () => {
  it("keeps the top pumpkins when compacting a stack", () => {
    expect(getMiniCollection([1, 2, 3, 4, 5, -1, -2, -3], "STACK", 5)).toEqual({
      values: [4, 5, -1, -2, -3], hiddenCount: 3
    });
  });

  it("keeps the front pumpkins when compacting a queue", () => {
    expect(getMiniCollection([1, 2, 3, 4, 5, -1, -2], "QUEUE", 5)).toEqual({
      values: [1, 2, 3, 4, 5], hiddenCount: 2
    });
  });

  it("does not report hidden pumpkins when everything fits", () => {
    expect(getMiniCollection([2, -1], "STACK", 5)).toEqual({ values: [2, -1], hiddenCount: 0 });
  });
});
