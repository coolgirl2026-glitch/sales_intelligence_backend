import { requireSupabase, readLocalDb, writeLocalDb, isSupabaseConfigured } from "../supabase.client.js";

export async function saveAnalysis(userId, companyId, { agent, tool, inputValues, output, createdByLoginId, createdByName }) {
  const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  const safeCompanyId = (companyId && isUuid(String(companyId))) ? companyId : null;

  const extendedInputValues = {
    ...inputValues,
    created_by_name: createdByName || null,
    created_by_login_id: createdByLoginId || null,
  };

  if (isSupabaseConfigured) {
    const client = requireSupabase();
    const fullPayload = {
      user_id: userId,
      company_id: safeCompanyId,
      agent,
      tool,
      input_values: extendedInputValues,
      output,
      created_by_login_id: createdByLoginId || null,
      created_by_name: createdByName || null,
    };

    try {
      const { data, error } = await client
        .from("analyses")
        .insert(fullPayload)
        .select()
        .single();

      if (!error) return data;

      // Retry without tracking columns if they don't exist in user's table (undefined column error)
      if (error.code === "42703" || error.message?.includes("created_by_")) {
        console.warn("User tracking columns are missing in analyses table. Retrying insert with base payload...");
        const basePayload = {
          user_id: userId,
          company_id: safeCompanyId,
          agent,
          tool,
          input_values: extendedInputValues,
          output,
        };
        const { data: retryData, error: retryError } = await client
          .from("analyses")
          .insert(basePayload)
          .select()
          .single();

        if (retryError) throw retryError;
        return retryData;
      }
      throw error;
    } catch (supabaseErr) {
      console.error("Supabase saveAnalysis error, falling back to local storage:", supabaseErr.message);
    }
  }

  // Fallback to local JSON DB
  const db = readLocalDb();
  const newAnalysis = {
    id: `local-an-${Math.random().toString(36).substring(2, 9)}`,
    user_id: userId,
    company_id: companyId || null,
    agent,
    tool,
    input_values: extendedInputValues,
    output,
    is_starred: false,
    created_by_login_id: createdByLoginId || null,
    created_by_name: createdByName || null,
    last_accessed_by_name: null,
    last_accessed_at: null,
    created_at: new Date().toISOString(),
  };
  db.analyses.push(newAnalysis);
  writeLocalDb(db);
  return newAnalysis;
}

export async function touchAnalysisAccess(analysisId, accessedByName) {
  if (!analysisId || !accessedByName) return;

  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const client = requireSupabase();
      const { error } = await client
        .from("analyses")
        .update({
          last_accessed_by_name: accessedByName,
          last_accessed_at: now,
        })
        .eq("id", analysisId);

      if (error) {
        // If columns are missing, fallback to updating input_values JSON
        if (error.code === "42703" || error.message?.includes("last_accessed_")) {
          const { data: record } = await client
            .from("analyses")
            .select("input_values")
            .eq("id", analysisId)
            .maybeSingle();

          if (record) {
            await client
              .from("analyses")
              .update({
                input_values: {
                  ...record.input_values,
                  last_accessed_by_name: accessedByName,
                  last_accessed_at: now,
                }
              })
              .eq("id", analysisId);
          }
        } else {
          console.error("Supabase touchAnalysisAccess error:", error.message);
        }
      }
    } catch (err) {
      console.error("Supabase touchAnalysisAccess exception:", err.message);
    }
  }

  // Always update local JSON DB too (covers both local-only mode and Supabase fallback records)
  const db = readLocalDb();
  const record = db.analyses.find((a) => a.id === analysisId);
  if (record) {
    record.last_accessed_by_name = accessedByName;
    record.last_accessed_at = now;
    writeLocalDb(db);
  }
}

export async function getUserAnalyses(userId, filters = {}) {
  let supabaseData = [];

  if (isSupabaseConfigured) {
    try {
      let query = requireSupabase()
        .from("analyses")
        .select(`
          *,
          companies ( name, industry )
        `)
        .eq("user_id", userId);

      if (filters.tool) {
        query = query.eq("tool", filters.tool);
      }

      if (filters.agent) {
        const normalizedAgent = filters.agent.toLowerCase().includes("thriving") ? "thriving" : "aspire";
        query = query.eq("agent", normalizedAgent);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      supabaseData = (data || []).map(item => ({
        ...item,
        created_by_name: item.created_by_name || item.input_values?.created_by_name || null,
        created_by_login_id: item.created_by_login_id || item.input_values?.created_by_login_id || null,
        last_accessed_by_name: item.last_accessed_by_name || item.input_values?.last_accessed_by_name || null,
        last_accessed_at: item.last_accessed_at || item.input_values?.last_accessed_at || null,
      }));
    } catch (err) {
      console.error("Supabase getUserAnalyses error, falling back to local:", err.message);
    }
  }

  // Read local database
  const db = readLocalDb();
  const localAnalyses = db.analyses
    .filter((item) => {
      if (item.user_id !== userId) return false;
      if (filters.tool && item.tool !== filters.tool) return false;
      if (filters.agent) {
        const itemAgent = item.agent.toLowerCase().includes("thriving") ? "thriving" : "aspire";
        const filterAgent = filters.agent.toLowerCase().includes("thriving") ? "thriving" : "aspire";
        if (itemAgent !== filterAgent) return false;
      }
      return true;
    })
    .map((item) => {
      const company = db.companies.find((c) => c.id === item.company_id);
      return {
        ...item,
        created_by_name: item.created_by_name || item.input_values?.created_by_name || null,
        created_by_login_id: item.created_by_login_id || item.input_values?.created_by_login_id || null,
        last_accessed_by_name: item.last_accessed_by_name || item.input_values?.last_accessed_by_name || null,
        last_accessed_at: item.last_accessed_at || item.input_values?.last_accessed_at || null,
        companies: company ? { name: company.name, industry: company.industry } : null,
      };
    });

  // Merge lists (avoid duplicates by ID, sort by created_at descending)
  const merged = [...supabaseData];
  for (const local of localAnalyses) {
    if (!merged.some((m) => m.id === local.id)) {
      merged.push(local);
    }
  }

  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged;
}

export async function getAnalysisById(analysisId, userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("analyses")
    .select("*")
    .eq("id", analysisId)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function toggleStarAnalysis(analysisId, userId, isStarred) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("analyses")
    .update({ is_starred: isStarred })
    .eq("id", analysisId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAnalysis(analysisId, userId) {
  const client = requireSupabase();
  const { error } = await client
    .from("analyses")
    .delete()
    .eq("id", analysisId)
    .eq("user_id", userId);

  if (error) throw error;
  return true;
}
