import { requireSupabase, isSupabaseConfigured } from "../supabase.client.js";

export function getColumnNameForTool(tool) {
  if (!tool) return null;
  const t = tool.toLowerCase();
  if (t === "intelligence") return "analysis_sales_intelligence";
  if (t === "icp" || t === "discovery" || t === "opportunity-discovery") return "analysis_opportunity_discovery";
  if (t === "outreach") return "analysis_outreach_generator";
  if (t === "execution") return "analysis_deal_execution";
  if (t === "proposal") return "analysis_proposal_intelligence";
  return null;
}

const memoryCache = new Map();

export async function getCachedResearch(companyName) {
  const normalizedInput = companyName?.replace(/\s+/g, '').toLowerCase();
  if (!normalizedInput) return null;

  if (memoryCache.has(normalizedInput)) {
    console.log(`[Memory Cache] Hit for ${normalizedInput}`);
    return memoryCache.get(normalizedInput);
  }

  if (!isSupabaseConfigured) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .rpc("get_company_by_normalized_name", { input_name: normalizedInput })
    .maybeSingle();

  if (error) {
    console.error("Error fetching cached research:", error.message);
    return null;
  }

  if (data) {
    memoryCache.set(normalizedInput, data);
  }

  return data || null;
}

export async function saveCachedResearch(companyName, rawPerplexityData, tool, claudeAnalysisJson, linkedinUrl = null) {
  const normalizedInput = companyName?.replace(/\s+/g, '').toLowerCase();
  const columnName = getColumnNameForTool(tool);

  if (normalizedInput) {
    const existingCache = memoryCache.get(normalizedInput) || {};
    const updatedCache = {
      ...existingCache,
      company_name: companyName || existingCache.company_name,
      raw_perplexity_data: rawPerplexityData !== null ? rawPerplexityData : existingCache.raw_perplexity_data,
      linkedin_url: linkedinUrl !== null ? linkedinUrl : existingCache.linkedin_url,
      updated_at: new Date().toISOString(),
    };
    if (columnName && claudeAnalysisJson) {
      updatedCache[columnName] = claudeAnalysisJson;
    }
    memoryCache.set(normalizedInput, updatedCache);
  }

  if (!isSupabaseConfigured) return;
  const client = requireSupabase();

  const payload = {
    company_name: companyName?.trim(),
    updated_at: new Date().toISOString(),
  };

  if (rawPerplexityData !== null) {
    payload.raw_perplexity_data = rawPerplexityData;
  }
  if (linkedinUrl !== null) {
    payload.linkedin_url = linkedinUrl;
  }
  if (columnName && claudeAnalysisJson) {
    payload[columnName] = claudeAnalysisJson;
  }

  const { error } = await client
    .from("company_research")
    .upsert(payload, { onConflict: "company_name" });

  if (error) {
    console.error("Error saving cached research:", error.message);
  }
}
