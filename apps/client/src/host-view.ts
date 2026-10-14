import { stackScore, type GameAction, type GameState } from "@pumpkin/shared";

export type AttackRoute = {
  sourceId: string;
  targetId: string | "WITCH";
  value: number;
};

export type MiniCollection = {
  values: number[];
  hiddenCount: number;
};

// A projected player tile has limited room. Keep the end students interact
// with visible: the top of a stack or the front of a queue.
export function getMiniCollection(
  values: number[],
  kind: "STACK" | "QUEUE",
  maxVisible = 5
): MiniCollection {
  const visibleCount = Math.max(0, maxVisible);
  const visibleValues = kind === "STACK"
    ? values.slice(-visibleCount || values.length)
    : values.slice(0, visibleCount);

  return {
    values: visibleValues,
    hiddenCount: Math.max(0, values.length - visibleValues.length)
  };
}

export function createAttackRoute(action: GameAction | null): AttackRoute | null {
  if (!action || action.command !== "SEND_TOP" || action.value === undefined) return null;
  const targetId = action.target === "WITCH" ? "WITCH" : action.targetId;
  if (!targetId) return null;
  return { sourceId: action.actorId, targetId, value: action.value };
}

export type MageAvatar = {
  name: "Cat" | "Fox" | "Owl" | "Frog" | "Rabbit";
  spritePosition: string;
};

const MAGE_AVATARS: MageAvatar[] = [
  { name: "Cat", spritePosition: "0%" },
  { name: "Fox", spritePosition: "25%" },
  { name: "Owl", spritePosition: "50%" },
  { name: "Frog", spritePosition: "75%" },
  { name: "Rabbit", spritePosition: "100%" }
];

// Socket IDs are stable during a game, so this simple hash gives each player
// the same animal on every screen without storing extra server state.
export function getMageAvatar(playerId: string, offset = 0): MageAvatar {
  const hash = Array.from(playerId).reduce(
    (total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0,
    0
  );
  return MAGE_AVATARS[(hash + offset) % MAGE_AVATARS.length]!;
}

export type HostViewModel = {
  players: Array<{
    id: string;
    name: string;
    connected: boolean;
    score: number;
    avatar: MageAvatar;
    stack: number[];
    queue: number[];
    commandProgress: string;
  }>;
  boss: null | { health: number; maxHealth: 100; multiplier: number };
};

export function createHostViewModel(state: GameState): HostViewModel {
  const usedAvatars = new Set<MageAvatar["name"]>();
  const players = Object.values(state.players)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(player => {
      let avatar = getMageAvatar(player.id);
      for (let offset = 1; usedAvatars.has(avatar.name) && offset < MAGE_AVATARS.length; offset += 1) {
        avatar = getMageAvatar(player.id, offset);
      }
      usedAvatars.add(avatar.name);
      return {
      id: player.id,
      name: player.name,
      connected: player.connected,
      score: stackScore(player.stack),
      avatar,
      stack: player.stack,
      queue: player.queue,
      commandProgress: `${player.commandIndex} / ${player.program.length}`
      };
    });

  return {
    players,
    boss: state.mode === "PVE"
      ? { health: state.witchHealth, maxHealth: 100, multiplier: players.length }
      : null
  };
}
