// Local prompt-compression utility used by graphifyEngine.js.
export class PromptCompressor {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
  }

  // Strips decorative separator bars, blank lines, and redundant
  // whitespace. Simple and dependency-free; not an LLM-based summarizer.
  async compressContext(text, _options = {}) {
    if (!text || typeof text !== "string") {
      return text;
    }

    let cleaned = text.replace(/[═─━─═╼╽╿🌉╝╚╗╔╩╦╠╬╪╬═=*\-_~─━]{4,}/g, "");

    let lines = cleaned.split("\n").map((line) => line.trim());
    lines = lines.filter((line) => line.length > 0);
    cleaned = lines.join("\n");

    cleaned = cleaned.replace(/[ \t]+/g, " ");

    return cleaned;
  }
}
