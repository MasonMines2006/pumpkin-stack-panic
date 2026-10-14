import { describe, expect, it } from "vitest";
import { createLobbyQuestion, LOBBY_QUESTION_VARIETIES } from "./lobby-practice.js";

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe("lobby practice", () => {
  it("randomizes across ten stack and queue operation varieties", () => {
    expect(LOBBY_QUESTION_VARIETIES).toBe(10);
    const questions = Array.from({ length: 10 }, (_, index) =>
      createLobbyQuestion(sequenceRandom([index / 10, .13, .37, .61, .79, .23, .47, .83]))
    );
    expect(questions.some(question => question.structure === "STACK")).toBe(true);
    expect(questions.some(question => question.structure === "QUEUE")).toBe(true);
    expect(new Set(questions.map(question => question.operation)).size).toBe(10);
  });

  it("always produces four unique answers with one valid correct index", () => {
    for (let index = 0; index < 40; index += 1) {
      const question = createLobbyQuestion(sequenceRandom([index / 40, .07, .31, .58, .92, .19, .73]));
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options).size).toBe(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(4);
      expect(question.explanation.length).toBeGreaterThan(10);
    }
  });
});
