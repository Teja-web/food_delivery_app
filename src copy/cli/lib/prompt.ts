/**
 * Minimal readline-based prompt helpers. Avoids pulling in `prompts` /
 * `inquirer` for a CLI with two interactive moments.
 */

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function askChoice(question: string, choices: string[]): Promise<string> {
  while (true) {
    const answer = (await ask(`${question} (${choices.join("/")}) `)).toLowerCase();
    const match = choices.find((c) => c.toLowerCase() === answer || c.toLowerCase().startsWith(answer));
    if (match) return match;
    console.error(`Please answer one of: ${choices.join(", ")}`);
  }
}

export async function askSecret(question: string): Promise<string> {
  // Silent mode: hide input. Falls back to plain readline if stdin can't be
  // muted (e.g. piped input).
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const out = stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void };
  const originalWrite = out._writeToOutput?.bind(out);
  if (originalWrite) {
    out._writeToOutput = (s: string) => {
      if (s === question || s.includes("\n") || s.includes("\r")) {
        originalWrite(s);
      } else {
        originalWrite("");
      }
    };
  }
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      if (originalWrite) out._writeToOutput = originalWrite;
      stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}
