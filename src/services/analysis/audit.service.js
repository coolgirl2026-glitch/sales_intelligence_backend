import { OPENROUTER_API_KEY, AUDIT_MODEL } from "../../config/env.js";
import { getCachedResearch } from "../../database/repositories/research.repository.js";
import { buildDeepAuditPrompt } from "../ai/prompt.service.js";
import { callOpenRouter } from "../ai/openrouter.service.js";
import { logTokenUsage } from "../../utils/tokenUsage.js";
import { cleanAndParseJson } from "../../utils/formatter.js";
import { EXCHANGE_RATE } from "../../config/constants.js";

export async function generateAudit({ company, website, inputs, outputData }) {
  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    throw new Error("Server configuration error: OpenRouter API key not set");
  }

  let webResearch = null;
  try {
    const record = await getCachedResearch(company);
    webResearch = record?.raw_perplexity_data;
  } catch (dbErr) {
    console.error("Supabase cache read error in audit:", dbErr);
  }

  const auditPrompt = buildDeepAuditPrompt(company, website, inputs, outputData, webResearch);
  const opusResponse = await callOpenRouter({
    apiKey,
    model: AUDIT_MODEL,
    messages: [{ role: "user", content: auditPrompt }],
    maxTokens: 1500,
    temperature: 0.1,
    responseFormat: { type: "json_object" }
  });

  const clUsage = opusResponse?.usage || {};
  const clPromptTokens = clUsage.prompt_tokens ?? clUsage.input_tokens ?? 0;
  const clCompletionTokens = clUsage.completion_tokens ?? clUsage.output_tokens ?? 0;
  const clTokensUsed = clPromptTokens + clCompletionTokens;
  const clCostUSD = (clPromptTokens * 0.000003) + (clCompletionTokens * 0.000015);
  const clCostINR = Number((clCostUSD * EXCHANGE_RATE).toFixed(6));

  await logTokenUsage({
    timestamp: new Date().toISOString(),
    company: company || "Unknown",
    strategy: "Forensic Audit",
    perplexity: {
      tokensUsed: 0,
      costINR: 0
    },
    claude: {
      tokensUsed: clTokensUsed,
      costINR: clCostINR
    }
  });

  const rawText = opusResponse?.choices?.[0]?.message?.content ?? "";
  const parsed = cleanAndParseJson(rawText);

  return { success: true, audit: parsed, webResearchUsed: !!webResearch };
}
