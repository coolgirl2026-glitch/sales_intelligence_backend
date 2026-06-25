import { SEARCH_MODEL, SEARCH_MAX_TOKENS } from "../../config/env.js";
import { callOpenRouter } from "../ai/openrouter.service.js";
import { buildWebResearchPrompt } from "../ai/prompt.service.js";
import { getUserCompanies } from "../../database/repositories/company.repository.js";
import { getSharedWorkspaceUserId } from "../auth/auth.service.js";

export async function callPerplexityWebSearch(companyName, websiteUrl, agent, tool, values, apiKey) {
  const searchPrompt = buildWebResearchPrompt(agent, tool, { ...values, company: companyName, website: websiteUrl });
  const messages = [
    {
      role: "system",
      content: `You are a web research assistant. Return concise factual research with URLs. Do not write sales recommendations. Focus your search explicitly on the domain mapping for website: ${websiteUrl || "not provided"}.`,
    },
    { role: "user", content: searchPrompt },
  ];

  return callOpenRouter({
    apiKey,
    model: SEARCH_MODEL,
    maxTokens: SEARCH_MAX_TOKENS,
    messages,
  });
}

export async function fetchUserCompanies() {
  const dbUserId = await getSharedWorkspaceUserId();
  return getUserCompanies(dbUserId);
}
