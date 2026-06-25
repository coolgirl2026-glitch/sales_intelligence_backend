import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { isVercel } from "../config/env.js";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "token-usage.jsonl");

export async function logTokenUsage(entry) {
  try {
    const targetDir = isVercel ? "/tmp" : LOG_DIR;
    const targetFile = isVercel ? path.join("/tmp", "token-usage.jsonl") : LOG_FILE;
    
    await mkdir(targetDir, { recursive: true });
    await appendFile(targetFile, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    console.warn("Failed to write token usage log to disk:", err.message);
  }
}

export function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    raw: usage,
  };
}
