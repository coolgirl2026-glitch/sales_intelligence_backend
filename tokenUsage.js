import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "token-usage.jsonl");

export async function logTokenUsage(entry) {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

export function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    raw: usage,
  };
}

