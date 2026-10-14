import { describe, expect, it } from "vitest";
import { createRoomCode, MAX_PLAYERS_PER_ROOM, MAX_ROOMS, RoomManager } from "./room-manager.js";

describe("RoomManager", () => {
  it("creates a lobby with the creator as a spectator host", () => {
    const manager = new RoomManager(() => "PUMP");

    const room = manager.createRoom("socket-a", "Mason");

    expect(room.code).toBe("PUMP");
    expect(room.hostPlayerId).toBe("socket-a");
    expect(room.game.phase).toBe("LOBBY");
    expect(room.game.players).toEqual({});
  });

  it("joins another player without replacing the host", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("socket-a", "Mason");

    const room = manager.joinRoom("PUMP", "socket-b", "Esha");

    expect(room.hostPlayerId).toBe("socket-a");
    expect(room.game.players["socket-b"]?.name).toBe("Esha");
  });

  it("rejects duplicate names and missing rooms", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("socket-a", "Mason");
    manager.joinRoom("PUMP", "socket-b", "Esha");

    expect(() => manager.joinRoom("PUMP", "socket-c", "Esha")).toThrow(
      "already in use"
    );
    expect(() => manager.joinRoom("NOPE", "socket-b", "Esha")).toThrow(
      "Room not found"
    );
  });

  it("starts a round with pumpkin stacks for each player", () => {
    const manager = new RoomManager(() => "PUMP", () => 0.5);
    manager.createRoom("socket-a", "Mason");
    manager.joinRoom("PUMP", "socket-b", "Esha");

    const room = manager.startRound("PUMP", "socket-a", "PVP", 90_000, 8);

    expect(room.game.phase).toBe("PLAYING");
    expect(room.game.mode).toBe("PVP");
    expect(room.game.players["socket-a"]).toBeUndefined();
    expect(room.game.players["socket-b"]?.stack).toHaveLength(8);
    expect(room.game.roundEndsAt).toBeGreaterThan(Date.now());
  });

  it("allows only the host to start a round", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("socket-a", "Mason");
    manager.joinRoom("PUMP", "socket-b", "Esha");

    expect(() =>
      manager.startRound("PUMP", "socket-b", "PVP", 90_000, 8)
    ).toThrow("Only the host");
  });

  it("validates names, timing, room phase, and code collisions", () => {
    const manager = new RoomManager(() => "PUMP");
    expect(() => manager.createRoom("socket-a", "   ")).toThrow("Display name");
    manager.createRoom("socket-a", "Mason");
    expect(() => manager.createRoom("socket-b", "Esha")).toThrow("free room code");
    manager.joinRoom("PUMP", "socket-b", "Esha");
    expect(() => manager.startRound("PUMP", "socket-a", "PVP", 10, 8)).toThrow(
      "duration"
    );
    manager.startRound("PUMP", "socket-a", "PVP", 1_000, 8);
    expect(() => manager.joinRoom("PUMP", "socket-b", "Esha")).toThrow(
      "already started"
    );
    expect(manager.finishRound("PUMP").game.phase).toBe("RESULTS");
  });

  it("tracks each player's submitted program progress for the host view", () => {
    const manager = new RoomManager(() => "PUMP", () => 0);
    manager.createRoom("socket-a", "Mason");
    manager.joinRoom("PUMP", "socket-b", "Esha");
    manager.startRound("PUMP", "socket-a", "PVP", 1_000, 2);

    manager.setPlayerProgram("PUMP", "socket-b", [{ type: "SEND_TOP" }]);
    expect(() => manager.executePlayerCommand("PUMP", "socket-b", { type: "SEND_TOP" })).toThrow("No connected opponent");

    expect(manager.getRoom("PUMP").game.players["socket-b"]?.program).toHaveLength(1);
  });

  it("requires at least one student before the host starts", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("socket-a", "TA");

    expect(() => manager.startRound("PUMP", "socket-a", "PVE", 1_000, 8)).toThrow(
      "At least one player"
    );
  });

  it("removes lobby students and disconnects active players cleanly", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("host", "TA");
    manager.joinRoom("PUMP", "student", "Mason");

    expect(manager.leaveRoom("PUMP", "student").game.players.student).toBeUndefined();
    manager.joinRoom("PUMP", "student", "Mason");
    manager.startRound("PUMP", "host", "PVE", 1_000, 2);

    expect(manager.leaveRoom("PUMP", "student").game.players.student?.connected).toBe(false);
  });
});

describe("RoomManager limits", () => {
  it("always generates four capital letters for room codes", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(createRoomCode()).toMatch(/^[A-Z]{4}$/);
    }
  });

  it("retries when a generated code is already taken", () => {
    // Arrange: the generator repeats PUMP once before offering a fresh code.
    const codes = ["PUMP", "PUMP", "BATS"];
    const manager = new RoomManager(() => codes.shift() ?? "ZZZZ");
    manager.createRoom("socket-a", "TA One");

    // Act
    const second = manager.createRoom("socket-b", "TA Two");

    // Assert
    expect(second.code).toBe("BATS");
  });

  it("refuses new rooms once the server holds MAX_ROOMS", () => {
    let counter = 0;
    const manager = new RoomManager(() => `R${counter++}`);
    for (let index = 0; index < MAX_ROOMS; index += 1) manager.createRoom(`host-${index}`, "TA");

    expect(() => manager.createRoom("one-too-many", "TA")).toThrow("Too many rooms");
  });

  it("refuses players once a room is full", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("host", "TA");
    for (let index = 0; index < MAX_PLAYERS_PER_ROOM; index += 1) {
      manager.joinRoom("PUMP", `student-${index}`, `Student ${index}`);
    }

    expect(() => manager.joinRoom("PUMP", "late", "Latecomer")).toThrow("room is full");
  });

  it("deletes a room so its code stops working", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("host", "TA");

    manager.deleteRoom("pump");

    expect(() => manager.getRoom("PUMP")).toThrow("Room not found");
  });

  it("rejects names with invisible or unusual characters but allows normal ones", () => {
    const manager = new RoomManager(() => "PUMP");
    manager.createRoom("host", "TA");

    expect(() => manager.joinRoom("PUMP", "a", "Evil\u202Ename")).toThrow("letters, numbers");
    expect(() => manager.joinRoom("PUMP", "b", "<b>hi</b>")).toThrow("letters, numbers");
    expect(manager.joinRoom("PUMP", "c", "José O'Neil-2").game.players.c?.name).toBe("José O'Neil-2");
  });
});

