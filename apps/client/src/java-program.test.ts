import { describe, expect, it } from "vitest";
import { parseJavaProgram, printJavaProgram } from "./java-program.js";

describe("Java-like program editor", () => {
  it("parses the supported Stack and Queue methods", () => {
    expect(parseJavaProgram(`
      stack.peek();
      queue.add(stack.pop());
      stack.push(queue.remove());
      opponent.add(stack.pop());
      stack.pop();
      queue.peek();
      queue.add(queue.remove());
      Collections.sort(stack);
    `)).toEqual({
      commands: [
        { type: "PEEK_TOP" },
        { type: "POP_TO_QUEUE" },
        { type: "DEQUEUE_TO_STACK" },
        { type: "SEND_TOP" },
        { type: "POP_TOP" },
        { type: "PEEK_QUEUE" },
        { type: "ROTATE_QUEUE" },
        { type: "SORT_STACK" }
      ],
      error: null
    });
  });

  it("prints commands as readable Java-like statements", () => {
    expect(printJavaProgram([{ type: "POP_TO_QUEUE" }, { type: "SEND_TOP" }])).toBe(
      "queue.add(stack.pop());\nopponent.add(stack.pop());"
    );
  });

  it("reports the line containing unsupported code", () => {
    expect(parseJavaProgram("stack.sort();")).toEqual({
      commands: [],
      error: "Line 1: Use one of the supported Stack or Queue statements."
    });
  });

  it("allows blank lines and Java comments", () => {
    expect(parseJavaProgram("// inspect the top\n\nstack.peek();\nCollections.sort(stack); // slow")).toEqual({
      commands: [{ type: "PEEK_TOP" }, { type: "SORT_STACK" }],
      error: null
    });
  });
});
