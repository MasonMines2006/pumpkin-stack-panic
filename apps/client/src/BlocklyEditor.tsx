import * as Blockly from "blockly";
import { useEffect, useRef } from "react";
import type { GameCommand } from "@pumpkin/shared";

const blockDefinitions = [
  ["peek_top", "Peek at top", 35],
  ["pop_to_queue", "Move top → queue", 25],
  ["dequeue_to_stack", "Move queue front → stack", 190],
  ["send_top", "Send top pumpkin", 290],
  ["pop_top", "Discard stack.pop()", 10],
  ["peek_queue", "Inspect queue.peek()", 55],
  ["rotate_queue", "Rotate queue front → back", 165],
  ["sort_stack", "Slow sort stack", 330]
] as const;

let registered = false;
function registerBlocks() {
  if (registered) return;
  for (const [type, message0, colour] of blockDefinitions) {
    Blockly.Blocks[type] = {
      init() {
        this.jsonInit({ message0, previousStatement: null, nextStatement: null, colour });
      }
    };
  }
  registered = true;
}

const commandByBlock: Record<string, GameCommand> = {
  peek_top: { type: "PEEK_TOP" },
  pop_to_queue: { type: "POP_TO_QUEUE" },
  dequeue_to_stack: { type: "DEQUEUE_TO_STACK" },
  send_top: { type: "SEND_TOP" },
  pop_top: { type: "POP_TOP" },
  peek_queue: { type: "PEEK_QUEUE" },
  rotate_queue: { type: "ROTATE_QUEUE" },
  sort_stack: { type: "SORT_STACK" }
};

const blockByCommand: Record<GameCommand["type"], string> = {
  PEEK_TOP: "peek_top",
  POP_TO_QUEUE: "pop_to_queue",
  DEQUEUE_TO_STACK: "dequeue_to_stack",
  SEND_TOP: "send_top",
  POP_TOP: "pop_top",
  PEEK_QUEUE: "peek_queue",
  ROTATE_QUEUE: "rotate_queue",
  SORT_STACK: "sort_stack"
};

export function BlocklyEditor({ initialCommands, onChange }: { initialCommands: GameCommand[]; onChange: (commands: GameCommand[]) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const initialCommandsRef = useRef(initialCommands);

  useEffect(() => {
    registerBlocks();
    if (!container.current) return;
    const workspace = Blockly.inject(container.current, {
      toolbox: {
        kind: "flyoutToolbox",
        contents: blockDefinitions.map(([type]) => ({ kind: "block", type }))
      },
      trashcan: true,
      grid: { spacing: 20, length: 3, colour: "#4a385f", snap: true }
    });

    let previous: Blockly.Block | null = null;
    for (const command of initialCommandsRef.current) {
      const block = workspace.newBlock(blockByCommand[command.type]);
      block.initSvg();
      block.render();
      if (previous?.nextConnection && block.previousConnection) {
        previous.nextConnection.connect(block.previousConnection);
      }
      previous = block;
    }

    const update = () => {
      const commands: GameCommand[] = [];
      for (const root of workspace.getTopBlocks(true)) {
        let block: Blockly.Block | null = root;
        while (block) {
          const command = commandByBlock[block.type];
          if (command) commands.push(command);
          block = block.getNextBlock();
        }
      }
      onChange(commands);
    };
    workspace.addChangeListener(update);
    return () => workspace.dispose();
  }, [onChange]);

  return <div className="blockly-editor" ref={container} aria-label="Pumpkin command blocks" />;
}
