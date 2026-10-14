export type LobbyQuestion = {
  structure: "STACK" | "QUEUE";
  values: number[];
  operation: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type QuestionTemplate = (values: number[], extra: number) => Omit<LobbyQuestion, "options" | "correctIndex"> & { answer: number };

const TEMPLATES: QuestionTemplate[] = [
  values => ({ structure: "STACK", values, operation: "stack.pop()", prompt: "Which pumpkin is removed?", answer: values.at(-1)!, explanation: "A stack is LIFO, so pop removes the newest value from the top." }),
  values => ({ structure: "STACK", values, operation: "stack.peek()", prompt: "Which value is returned?", answer: values.at(-1)!, explanation: "Peek reads the top of a stack without removing it." }),
  values => ({ structure: "QUEUE", values, operation: "queue.remove()", prompt: "Which pumpkin leaves first?", answer: values[0]!, explanation: "A queue is FIFO, so remove takes the oldest value from the front." }),
  values => ({ structure: "QUEUE", values, operation: "queue.peek()", prompt: "Which value is returned?", answer: values[0]!, explanation: "Queue peek reads the front value without removing it." }),
  (values, extra) => ({ structure: "STACK", values, operation: `stack.push(${extra}); stack.peek();`, prompt: "What does peek return?", answer: extra, explanation: "Push places the new value on top, so peek immediately returns it." }),
  (values, extra) => ({ structure: "QUEUE", values, operation: `queue.add(${extra}); queue.peek();`, prompt: "What does peek return?", answer: values[0]!, explanation: "Add places the new value at the back, so the existing front stays first." }),
  values => ({ structure: "QUEUE", values, operation: "queue.add(queue.remove()); queue.peek();", prompt: "What is at the front now?", answer: values[1]!, explanation: "Moving the front to the back makes the second-oldest value the new front." }),
  values => ({ structure: "STACK", values, operation: "Collections.sort(stack); stack.peek();", prompt: "What is on top after sorting?", answer: Math.max(...values), explanation: "Ascending sort puts the greatest value at the end, which is the top of this stack." }),
  values => ({ structure: "STACK", values, operation: "stack.pop(); stack.peek();", prompt: "What does the final peek return?", answer: values.at(-2)!, explanation: "Pop removes the current top, exposing the value directly underneath it." }),
  values => ({ structure: "QUEUE", values, operation: "queue.remove(); queue.peek();", prompt: "What does the final peek return?", answer: values[1]!, explanation: "Remove takes the front value, so the second value becomes the new front." })
];

function takeRandom(pool: number[], random: () => number): number {
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool.splice(index, 1)[0]!;
}

export function createLobbyQuestion(random: () => number = Math.random): LobbyQuestion {
  const templateIndex = Math.min(TEMPLATES.length - 1, Math.floor(random() * TEMPLATES.length));
  const valuePool = Array.from({ length: 11 }, (_, index) => index - 5);
  const values = [takeRandom(valuePool, random), takeRandom(valuePool, random), takeRandom(valuePool, random)];
  const extra = takeRandom(valuePool, random);
  const question = TEMPLATES[templateIndex]!(values, extra);
  const distractorPool = valuePool.filter(value => value !== question.answer);
  const options = [question.answer];
  while (options.length < 4) options.push(takeRandom(distractorPool, random));
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(random() * (index + 1)));
    [options[index], options[swapIndex]] = [options[swapIndex]!, options[index]!];
  }
  return { ...question, options: options.map(String), correctIndex: options.indexOf(question.answer) };
}

export const LOBBY_QUESTION_VARIETIES = TEMPLATES.length;
