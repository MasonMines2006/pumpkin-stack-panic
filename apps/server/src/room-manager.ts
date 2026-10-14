import { randomInt } from "node:crypto";
import {
  createPumpkinStack,
  executeCommand,
  type GameCommand,
  type GameMode,
  type GameState,
  type PlayerState
} from "@pumpkin/shared";

/** Caps that stop one student with a script from filling the TA laptop's memory. */
export const MAX_ROOMS = 50;
export const MAX_PLAYERS_PER_ROOM = 40;
const MAX_CODE_ATTEMPTS = 20;
const ROOM_CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// Letters (any language), digits, spaces, and _ ' . - only. This blocks invisible
// control characters and right-to-left tricks that could garble the projector.
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _'.-]+$/u;

/**
 * Four random capital letters. crypto.randomInt is evenly distributed, unlike the old
 * Math.random().toString(36) trick, which sometimes produced digits or 3-character codes.
 */
export function createRoomCode(): string {
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += ROOM_CODE_LETTERS[randomInt(ROOM_CODE_LETTERS.length)];
  }
  return code;
}

export type Room = {
  code: string;
  hostPlayerId: string;
  game: GameState;
};

function lobbyPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    connected: true,
    stack: [],
    queue: [],
    program: [],
    commandIndex: 0
  };
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly createCode: () => string = createRoomCode,
    private readonly random: () => number = Math.random
  ) {}

  createRoom(playerId: string, rawName: string): Room {
    // The creator is the TA/display. Validate the label for a useful request,
    // but do not add the host to the competitive player collection.
    this.validName(rawName);
    if (this.rooms.size >= MAX_ROOMS) throw new Error("Too many rooms are open; try again later");
    const code = this.unusedCode();

    const room: Room = {
      code,
      hostPlayerId: playerId,
      game: {
        mode: "PVP",
        phase: "LOBBY",
        players: {},
        witchStack: [],
        witchHealth: 100,
        roundEndsAt: null
      }
    };
    this.rooms.set(code, room);
    return structuredClone(room);
  }

  joinRoom(rawCode: string, playerId: string, rawName: string): Room {
    const room = this.requiredRoom(rawCode);
    if (room.game.phase !== "LOBBY") throw new Error("The round has already started");
    const name = this.validName(rawName);
    if (Object.keys(room.game.players).length >= MAX_PLAYERS_PER_ROOM) {
      throw new Error("This room is full");
    }
    const duplicate = Object.values(room.game.players).some(
      player => player.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new Error("That display name is already in use");
    room.game.players[playerId] = lobbyPlayer(playerId, name);
    return structuredClone(room);
  }

  startRound(
    rawCode: string,
    requesterId: string,
    mode: GameMode,
    durationMs: number,
    stackSize: number
  ): Room {
    const room = this.requiredRoom(rawCode);
    if (room.hostPlayerId !== requesterId) throw new Error("Only the host can start a round");
    if (durationMs < 1_000 || durationMs > 10 * 60_000) {
      throw new Error("Round duration is outside the allowed range");
    }
    if (Object.keys(room.game.players).length === 0) {
      throw new Error("At least one player must join before starting");
    }

    room.game.mode = mode;
    room.game.phase = "PLAYING";
    room.game.roundEndsAt = Date.now() + durationMs;
    room.game.witchStack = mode === "PVE" ? createPumpkinStack(stackSize, this.random) : [];
    room.game.witchHealth = 100;
    for (const player of Object.values(room.game.players)) {
      player.stack = createPumpkinStack(stackSize, this.random);
      player.queue = [];
      player.program = [];
      player.commandIndex = 0;
    }
    return structuredClone(room);
  }

  getRoom(rawCode: string): Room {
    return structuredClone(this.requiredRoom(rawCode));
  }

  leaveRoom(rawCode: string, playerId: string): Room {
    const room = this.requiredRoom(rawCode);
    const player = room.game.players[playerId];
    if (player) {
      if (room.game.phase === "LOBBY") delete room.game.players[playerId];
      else player.connected = false;
    }
    return structuredClone(room);
  }

  deleteRoom(rawCode: string): void {
    this.rooms.delete(rawCode.trim().toUpperCase());
  }

  executePlayerCommand(
    rawCode: string,
    playerId: string,
    command: GameCommand
  ): Room {
    const room = this.requiredRoom(rawCode);
    room.game = executeCommand(room.game, playerId, command, this.random);
    const player = room.game.players[playerId];
    if (player) player.commandIndex += 1;
    return structuredClone(room);
  }

  setPlayerProgram(rawCode: string, playerId: string, program: GameCommand[]): Room {
    const room = this.requiredRoom(rawCode);
    const player = room.game.players[playerId];
    if (!player) throw new Error("Player not found");
    player.program = structuredClone(program);
    player.commandIndex = 0;
    return structuredClone(room);
  }

  finishRound(rawCode: string): Room {
    const room = this.requiredRoom(rawCode);
    room.game.phase = "RESULTS";
    room.game.roundEndsAt = null;
    return structuredClone(room);
  }

  private unusedCode(): string {
    // With 26^4 ≈ 457,000 codes and at most 50 rooms, a retry is rare; the cap just
    // guarantees a misbehaving generator can never loop forever.
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.createCode().toUpperCase();
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Could not find a free room code; try again");
  }

  private requiredRoom(rawCode: string): Room {
    const room = this.rooms.get(rawCode.trim().toUpperCase());
    if (!room) throw new Error("Room not found");
    return room;
  }

  private validName(rawName: string): string {
    const name = rawName.trim();
    if (name.length < 1 || name.length > 24) {
      throw new Error("Display name must be 1 to 24 characters");
    }
    if (!DISPLAY_NAME_PATTERN.test(name)) {
      throw new Error("Display name can only use letters, numbers, spaces, and _ ' . -");
    }
    return name;
  }
}
