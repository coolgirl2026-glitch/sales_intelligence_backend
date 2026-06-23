// Local prompt-compression utility used by graphifyEngine.js.
//
// This used to be imported from an npm package literally named "graphify".
// That name collides with a real, unrelated package on the public npm
// registry (a "Random Graph Generator" CLI tool with a completely different
// API). Someone had hand-patched node_modules/graphify locally with a
// homemade compressor class so the import would resolve to *this* class
// instead of the real package — but that hack does not survive a clean
// `npm install`: npm would fetch the real "graphify" package from the
// registry, silently overwrite the patched copy, and break compression at
// runtime (the real package has no `compressContext` method).
//
// Moving the implementation here removes the name collision entirely and
// makes the behavior deterministic regardless of how dependencies are
// installed.
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
