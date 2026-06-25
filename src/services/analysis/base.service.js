import { randomUUID } from "node:crypto";
import {
  OPENROUTER_API_KEY,
  ANALYSIS_MODEL,
  ANALYSIS_MAX_TOKENS,
  MOCK_GENERATE,
} from "../../config/env.js";
import { EXCHANGE_RATE } from "../../config/constants.js";
import { getSharedWorkspaceUserId } from "../auth/auth.service.js";
import { getCachedResearch, saveCachedResearch } from "../../database/repositories/research.repository.js";
import { upsertCompany } from "../../database/repositories/company.repository.js";
import { saveAnalysis } from "../../database/repositories/analysis.repository.js";
import { callPerplexityWebSearch } from "../research/research.service.js";
import { getSystemPrompt, getUserMessage } from "../ai/prompt.service.js";
import { compressPrompt } from "../ai/graphify.service.js";
import { callOpenRouter } from "../ai/openrouter.service.js";
import { logTokenUsage } from "../../utils/tokenUsage.js";
import { cleanAndParseJson } from "../../utils/formatter.js";
import { summarizePriorAnalysis } from "../../utils/helpers.js";
import { isSupabaseConfigured } from "../../database/supabase.client.js";

export async function runAnalysisPipeline({ agent, tool, values, forceRefresh, forceNewWebSearch, user }) {
  const userId = await getSharedWorkspaceUserId();

  // Mock mode
  if (MOCK_GENERATE) {
    const mockOutput = {
      summary: "Mock analysis",
      recommendations: [
        { title: "Reach out via LinkedIn", rationale: "High ICP fit" },
      ],
      details: { company: values?.company || "Test Company" },
    };
    return { output: mockOutput, requestId: "mock-request", analysisId: null };
  }

  // Check API key
  const apiKey = OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    throw new Error("Server configuration error: OpenRouter API key not set");
  }

  const requestId = randomUUID();
  const companyName = values.company;

  const forceNewWebSearchVal = forceNewWebSearch !== undefined
    ? forceNewWebSearch
    : (values?.forceNewWebSearch !== undefined ? values.forceNewWebSearch : forceRefresh);

  let webResearch = null;
  let searchData = null;
  let strategy = "Cached Analysis Only";
  let perplexityTokens = 0;
  let perplexityCost = 0;
  let historicalMemoryContext = "";
  let record = null;

  // STRICT GUARD PATH: Generate Analysis (forceNewWebSearch is FALSE)
  if (!forceNewWebSearchVal) {
    if (!companyName) {
      throw Object.assign(new Error("Company name is required."), { status: 400 });
    }
    record = await getCachedResearch(companyName);
    if (!record || !record.raw_perplexity_data) {
      throw Object.assign(new Error("No data saved before. Please run a Live Search first to fetch company data."), { status: 400 });
    }
    webResearch = record.raw_perplexity_data;

    // Construct historicalMemoryContext block summarizing prior agent discoveries
    const memorySegments = [];
    if (record.analysis_proposal_intelligence) {
      const summary = summarizePriorAnalysis(record.analysis_proposal_intelligence, "proposal_intelligence");
      if (summary) memorySegments.push({ type: "proposal", title: "### PRIOR PROPOSAL INTELLIGENCE INSIGHTS:", content: summary, age: 1 });
    }
    if (record.analysis_deal_execution) {
      const summary = summarizePriorAnalysis(record.analysis_deal_execution, "deal_execution");
      if (summary) memorySegments.push({ type: "execution", title: "### PRIOR DEAL EXECUTION INSIGHTS:", content: summary, age: 2 });
    }
    if (record.analysis_outreach_generator) {
      const summary = summarizePriorAnalysis(record.analysis_outreach_generator, "outreach_generator");
      if (summary) memorySegments.push({ type: "outreach", title: "### PRIOR OUTREACH GENERATOR INSIGHTS:", content: summary, age: 3 });
    }
    if (record.analysis_opportunity_discovery) {
      const summary = summarizePriorAnalysis(record.analysis_opportunity_discovery, "opportunity_discovery");
      if (summary) memorySegments.push({ type: "opportunity", title: "### PRIOR OPPORTUNITY SCORES & DISCOVERY FOCUS:", content: summary, age: 4 });
    }
    if (record.analysis_sales_intelligence) {
      const summary = summarizePriorAnalysis(record.analysis_sales_intelligence, "sales_intelligence");
      if (summary) memorySegments.push({ type: "intelligence", title: "### PRIOR SALES INTELLIGENCE INSIGHTS:", content: summary, age: 5 });
    }

    function formatMemoryContext(segments) {
      const sorted = [...segments].sort((a, b) => b.age - a.age);
      return sorted.map(seg => `${seg.title}\n${seg.content}`).join("\n\n").trim();
    }

    while (memorySegments.length > 0 && formatMemoryContext(memorySegments).length > 800) {
      let oldestIdx = 0;
      for (let i = 1; i < memorySegments.length; i++) {
        if (memorySegments[i].age > memorySegments[oldestIdx].age) {
          oldestIdx = i;
        }
      }
      memorySegments.splice(oldestIdx, 1);
    }

    historicalMemoryContext = formatMemoryContext(memorySegments);
    perplexityTokens = 0;
    perplexityCost = 0;
    strategy = "Cached Analysis Only";
  } else {
    // LIVE SEARCH PATH: forceNewWebSearch is TRUE
    strategy = "Live Search";
    searchData = await callPerplexityWebSearch(companyName, values.website, agent, tool, values, apiKey);

    webResearch = searchData?.choices?.[0]?.message?.content || "No web research returned.";

    const usage = searchData?.usage || {};
    const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    perplexityTokens = promptTokens + completionTokens;
    perplexityCost = (promptTokens * 0.000001) + (completionTokens * 0.000001) + 0.005;

    if (webResearch && webResearch !== "No web research returned." && companyName && isSupabaseConfigured) {
      try {
        await saveCachedResearch(companyName, webResearch, null, null, values.linkedinUrl || null);
      } catch (dbErr) {
        console.error("Supabase cache pre-save error (non-fatal):", dbErr.message);
      }
    }
  }

  // Build prompts
  const rawSystemPrompt = getSystemPrompt(agent);
  const rawUserMessage = getUserMessage(tool, values, agent, webResearch, historicalMemoryContext);

  // Compress prompts
  const compressed = await compressPrompt(rawSystemPrompt, rawUserMessage);
  const systemPrompt = compressed.compressedSystemPrompt;
  const userMessage = compressed.compressedUserMessage;

  // Call OpenRouter
  const analysisData = await callOpenRouter({
    apiKey,
    model: ANALYSIS_MODEL,
    maxTokens: ANALYSIS_MAX_TOKENS,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const perpCostINR = Number((perplexityCost * EXCHANGE_RATE).toFixed(6));

  const clUsage = analysisData?.usage || {};
  const clPromptTokens = clUsage.prompt_tokens ?? clUsage.input_tokens ?? 0;
  const clCompletionTokens = clUsage.completion_tokens ?? clUsage.output_tokens ?? 0;
  const clTokensUsed = clPromptTokens + clCompletionTokens;
  const clCostUSD = (clPromptTokens * 0.000003) + (clCompletionTokens * 0.000015);
  const clCostINR = Number((clCostUSD * EXCHANGE_RATE).toFixed(6));

  await logTokenUsage({
    timestamp: new Date().toISOString(),
    company: companyName || "Unknown",
    strategy,
    perplexity: {
      tokensUsed: perplexityTokens,
      costINR: perpCostINR
    },
    claude: {
      tokensUsed: clTokensUsed,
      costINR: clCostINR
    }
  });

  const rawText = analysisData?.choices?.[0]?.message?.content ?? "";
  const parsed = cleanAndParseJson(rawText);

  // Save final Claude analysis JSON into Supabase cache
  if (companyName && isSupabaseConfigured) {
    try {
      await saveCachedResearch(companyName, webResearch, tool, parsed, values.linkedinUrl || null);
    } catch (dbErr) {
      console.error("Supabase cache save error (non-fatal):", dbErr.message);
    }
  }

  let analysisId = null;
  if (userId && isSupabaseConfigured) {
    let companyId = null;
    try {
      const company = await upsertCompany(userId, values);
      companyId = company?.id;
    } catch (coErr) {
      console.error("Supabase company upsert error (non-fatal):", coErr.message);
    }

    try {
      const savedAnalysis = await saveAnalysis(userId, companyId, {
        agent: agent.toLowerCase().includes("thriving") ? "thriving" : "aspire",
        tool,
        inputValues: values,
        output: parsed,
        createdByLoginId: user?.id || null,
        createdByName: user?.name || null,
      });
      analysisId = savedAnalysis?.id || null;
    } catch (dbErr) {
      console.error("Supabase save analysis error (non-fatal):", dbErr.message);
    }
  }

  return {
    output: parsed,
    requestId,
    analysisId,
    canonicalCompany: record?.company_name || companyName
  };
}
