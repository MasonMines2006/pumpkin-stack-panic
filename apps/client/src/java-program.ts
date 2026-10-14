import type { GameCommand } from "@pumpkin/shared";

const commandByStatement = new Map<string, GameCommand>([
  ["stack.peek();", { type: "PEEK_TOP" }],
  ["queue.add(stack.pop());", { type: "POP_TO_QUEUE" }],
  ["stack.push(queue.remove());", { type: "DEQUEUE_TO_STACK" }],
  ["opponent.add(stack.pop());", { type: "SEND_TOP" }],
  ["stack.pop();", { type: "POP_TOP" }],
  ["queue.peek();", { type: "PEEK_QUEUE" }],
  ["queue.add(queue.remove());", { type: "ROTATE_QUEUE" }],
  ["Collections.sort(stack);", { type: "SORT_STACK" }]
]);

const statementByCommand: Record<GameCommand["type"], string> = {
  PEEK_TOP: "stack.peek();",
  POP_TO_QUEUE: "queue.add(stack.pop());",
  DEQUEUE_TO_STACK: "stack.push(queue.remove());",
  SEND_TOP: "opponent.add(stack.pop());",
  POP_TOP: "stack.pop();",
  PEEK_QUEUE: "queue.peek();",
  ROTATE_QUEUE: "queue.add(queue.remove());",
  SORT_STACK: "Collections.sort(stack);"
};

export type ParsedJavaProgram = {
  commands: GameCommand[];
  error: string | null;
};

// This is intentionally a small Java-like language, not eval(). Students see
// real method vocabulary while the game server receives validated commands.
export function parseJavaProgram(source: string): ParsedJavaProgram {
  const commands: GameCommand[] = [];
  const lines = source.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const statement = lines[index]!.split("//", 1)[0]!.trim();
    if (statement === "") continue;
    const command = commandByStatement.get(statement);
    if (!command) {
      return {
        commands: [],
        error: `Line ${index + 1}: Use one of the supported Stack or Queue statements.`
      };
    }
    commands.push({ ...command });
  }

  if (commands.length > 20) {
    return { commands: [], error: "Programs can contain at most 20 statements." };
  }
  return { commands, error: null };
}

export function printJavaProgram(commands: GameCommand[]): string {
  return commands.map(command => statementByCommand[command.type]).join("\n");
}
