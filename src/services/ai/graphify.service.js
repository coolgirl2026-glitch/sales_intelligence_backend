import { compressSalesPayload } from "../../graphify-layer/graphifyEngine.js";

export async function compressPrompt(rawSystem, rawUser) {
  try {
    return await compressSalesPayload(rawSystem, rawUser);
  } catch (err) {
    console.error("Graphify compression failed, falling back to uncompressed prompts:", err.message);
    return {
      compressedSystemPrompt: rawSystem,
      compressedUserMessage: rawUser,
      metrics: null
    };
  }
}
