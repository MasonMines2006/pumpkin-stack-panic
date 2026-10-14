export type GameMode = "PVP" | "PVE";
export type GamePhase = "LOBBY" | "PLAYING" | "RESULTS";

export type GameCommand =
  | { type: "PEEK_TOP" }
  | { type: "POP_TO_QUEUE" }
  | { type: "DEQUEUE_TO_STACK" }
  | { type: "SEND_TOP" }
  | { type: "POP_TOP" }
  | { type: "PEEK_QUEUE" }
  | { type: "ROTATE_QUEUE" }
  | { type: "SORT_STACK" };

export type PlayerState = {
  id: string;
  name: string;
  connected: boolean;
  stack: number[];
  queue: number[];
  program: GameCommand[];
  commandIndex: number;
};

export type GameState = {
  mode: GameMode;
  phase: GamePhase;
  players: Record<string, PlayerState>;
  witchStack: number[];
  witchHealth: number;
  roundEndsAt: number | null;
};

export type GameAction = {
  id: string;
  command: GameCommand["type"];
  actorId: string;
  targetId?: string;
  target?: "WITCH";
  value?: number;
};

export type PvpResult = {
  playerId: string;
  name: string;
  score: number;
};

export type PveResult = {
  classScore: number;
  witchScore: number;
  classWon: boolean;
};

export function createPumpkinStack(
  size: number,
  random: () => number = Math.random
): number[] {
  if (!Number.isInteger(size) || size < 0 || size > 100) {
    throw new Error("Stack size must be an integer from 0 to 100");
  }

  return Array.from({ length: size }, () =>
    Math.min(5, Math.floor(random() * 11) - 5)
  );
}

export function stackScore(stack: number[]): number {
  return stack.reduce((total, value) => total + value, 0);
}

export function calculatePvpRanking(state: GameState): PvpResult[] {
  return Object.values(state.players)
    .map(({ id, name, stack }) => ({ playerId: id, name, score: stackScore(stack) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function calculatePveResult(state: GameState): PveResult {
  const players = Object.values(state.players);
  const classScore = players.reduce(
    (total, current) => total + stackScore(current.stack),
    0
  );
  const witchScore = stackScore(state.witchStack) * players.length;

  return { classScore, witchScore, classWon: classScore > witchScore };
}

export function executeCommand(
  state: GameState,
  playerId: string,
  command: GameCommand,
  random: () => number = Math.random
): GameState {
  if (state.phase !== "PLAYING") {
    throw new Error("Commands can only run during a round");
  }

  const next = structuredClone(state);
  const actor = next.players[playerId];
  if (!actor) throw new Error("Player not found");

  if (command.type === "PEEK_TOP" || command.type === "PEEK_QUEUE") return next;

  if (command.type === "POP_TOP") {
    if (actor.stack.pop() === undefined) throw new Error("Cannot pop an empty stack");
    return next;
  }

  if (command.type === "POP_TO_QUEUE") {
    const pumpkin = actor.stack.pop();
    if (pumpkin === undefined) throw new Error("Cannot pop an empty stack");
    actor.queue.push(pumpkin);
    return next;
  }

  if (command.type === "DEQUEUE_TO_STACK") {
    const pumpkin = actor.queue.shift();
    if (pumpkin === undefined) throw new Error("Cannot dequeue an empty queue");
    actor.stack.push(pumpkin);
    return next;
  }

  if (command.type === "ROTATE_QUEUE") {
    const pumpkin = actor.queue.shift();
    if (pumpkin === undefined) throw new Error("Cannot rotate an empty queue");
    actor.queue.push(pumpkin);
    return next;
  }

  if (command.type === "SORT_STACK") {
    actor.stack.sort((left, right) => left - right);
    return next;
  }

  const pumpkin = actor.stack.pop();
  if (pumpkin === undefined) throw new Error("Cannot send from an empty stack");

  if (next.mode === "PVE") {
    next.witchStack.push(pumpkin);
    const healthChange = pumpkin * Object.keys(next.players).length;
    next.witchHealth = Math.max(0, Math.min(100, next.witchHealth + healthChange));
    return next;
  }

  const opponents = Object.values(next.players).filter(
    candidate => candidate.id !== playerId && candidate.connected
  );
  if (opponents.length === 0) throw new Error("No connected opponent is available");

  const targetIndex = Math.min(
    opponents.length - 1,
    Math.floor(random() * opponents.length)
  );
  opponents[targetIndex]?.stack.push(pumpkin);
  return next;
}
