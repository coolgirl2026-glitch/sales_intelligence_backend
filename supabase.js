import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to backend .env.");
  }

  return supabase;
}

const LOCAL_DB_PATH = path.join(process.cwd(), "local_db.json");

function readLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read local DB file:", err);
  }
  return { companies: [], analyses: [] };
}

function writeLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write local DB file:", err);
  }
}

async function findUserByEmail(email) {
  const client = requireSupabase();
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;

    if (!data?.nextPage || data.nextPage === page) break;
    page = data.nextPage;
  }

  return null;
}

function generatePassword() {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}A1!`;
}

export async function resolveOrCreateUser(email, password) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Email is required");

  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) return existingUser.id;

  const safePassword = password && password.length >= 6 ? password : generatePassword();
  const { data, error } = await requireSupabase().auth.admin.createUser({
    email: normalizedEmail,
    password: safePassword,
  });

  if (error) {
    const existingAfterError = await findUserByEmail(normalizedEmail);
    if (existingAfterError) return existingAfterError.id;
    throw error;
  }

  return data.user.id;
}

export async function upsertCompany(userId, values) {
  const companyName = values.company?.trim();
  if (!companyName) return null;

  if (isSupabaseConfigured) {
    try {
      const client = requireSupabase();
      const { data: existing } = await client
        .from("companies")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", companyName)
        .maybeSingle();

      const payload = {
        user_id: userId,
        name: companyName,
        website: values.website || null,
        industry: values.industry || null,
        size: values.size || null,
        location: values.location || null,
        contact_role: values.persona || null,
        known_pain: values.pain || values.challenge || values.context || null,
      };

      if (existing?.id) {
        const { data, error } = await client
          .from("companies")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }

      const { data, error } = await client
        .from("companies")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (supabaseErr) {
      console.error("Supabase upsertCompany error, falling back to local storage:", supabaseErr.message);
    }
  }

  // Fallback to local JSON DB
  const db = readLocalDb();
  let existing = db.companies.find(
    (c) => c.user_id === userId && c.name.toLowerCase() === companyName.toLowerCase()
  );
  if (existing) {
    existing.website = values.website || existing.website || null;
    existing.industry = values.industry || existing.industry || null;
    existing.size = values.size || existing.size || null;
    existing.location = values.location || existing.location || null;
    existing.contact_role = values.persona || existing.contact_role || null;
    existing.known_pain = values.pain || values.challenge || values.context || existing.known_pain || null;
    existing.updated_at = new Date().toISOString();
  } else {
    existing = {
      id: `local-co-${Math.random().toString(36).substring(2, 9)}`,
      user_id: userId,
      name: companyName,
      website: values.website || null,
      industry: values.industry || null,
      size: values.size || null,
      location: values.location || null,
      contact_role: values.persona || null,
      known_pain: values.pain || values.challenge || values.context || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.companies.push(existing);
  }
  writeLocalDb(db);
  return existing;
}

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

// Records that a user opened/viewed an analysis from the Recents panel.
// Updates last_accessed_by_name and last_accessed_at on the record.
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

// ─── Companies (list / single-record CRUD) ─────────────────────────────────
// Ported from the older supabase-setup backend during the June 2026 merge.
// These currently require Supabase to be configured (no local-JSON fallback
// yet, unlike upsertCompany/saveAnalysis/getUserAnalyses above).

export async function getUserCompanies(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
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

// ─── Outreach saves ─────────────────────────────────────────────────────────

export async function saveOutreachMessage(userId, { analysisId, companyId, channel, subject, content }) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .insert({
      user_id: userId,
      analysis_id: analysisId || null,
      company_id: companyId || null,
      channel,
      subject: subject || null,
      content,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markOutreachSent(outreachId, userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .update({ was_sent: true, sent_at: new Date().toISOString() })
    .eq("id", outreachId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getUserOutreach(userId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("outreach_saves")
    .select(`
      *,
      companies ( name )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

// ─── Login accounts (individual authentication) ────────────────────────────
// Stored in a dedicated `login` table (see login_schema.sql) — separate from
// Supabase Auth's own auth.users, and separate from the shared workspace
// user_id used on companies/analyses/outreach_saves above. Every person gets
// their own row here (real signup/login), but their work still lands in the
// one shared workspace.

export async function createLoginAccount({
  name,
  email,
  passwordHash,
  role = "member",
  status = "pending",
  invitedBy = null,
  approvedBy = null,
}) {
  const client = requireSupabase();
  const payload = {
    name,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role,
    status,
    invited_by: invitedBy || null,
  };
  if (status === "active") {
    payload.approved_by = approvedBy || null;
    payload.approved_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from("login")
    .insert(payload)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("An account with this email already exists"), { status: 409 });
    }
    throw error;
  }
  return data;
}

export async function findLoginAccountByEmail(email) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findLoginAccountById(id) {
  if (!id) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .select("id, name, email, role, status, created_at, last_login_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function touchLoginLastSeen(id) {
  const client = requireSupabase();
  const { error } = await client
    .from("login")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);

  if (error) console.error("Failed to update last_login_at:", error.message);
}

// ─── Members / admin management ────────────────────────────────────────────

// Lists accounts for the in-app Members list / admin panel. Never returns
// password_hash. Pass { status: "pending" } to get the join-request queue,
// or omit to get everyone.
export async function listLoginAccounts({ status } = {}) {
  const client = requireSupabase();
  let query = client
    .from("login")
    .select("id, name, email, role, status, invited_by, approved_by, approved_at, rejected_at, created_at, last_login_at");

  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateLoginStatus(id, status, { approvedBy = null } = {}) {
  const client = requireSupabase();
  const payload = { status };
  if (status === "active") {
    payload.approved_by = approvedBy;
    payload.approved_at = new Date().toISOString();
    payload.rejected_at = null;
  } else if (status === "rejected") {
    payload.approved_by = approvedBy;
    payload.rejected_at = new Date().toISOString();
  }

  const { data, error } = await client
    .from("login")
    .update(payload)
    .eq("id", id)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateLoginRole(id, role) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("login")
    .update({ role })
    .eq("id", id)
    .select("id, name, email, role, status, created_at")
    .single();

  if (error) throw error;
  return data;
}

// ─── Invites ────────────────────────────────────────────────────────────────

export async function createInvite({ email = null, code, role = "member", createdBy, expiresAt = null }) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .insert({
      email: email ? email.toLowerCase() : null,
      code,
      role,
      created_by: createdBy || null,
      expires_at: expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function findInviteByCode(code) {
  if (!code) return null;
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .select("*")
    .eq("code", code.trim())
    .is("used_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function markInviteUsed(id, usedBy) {
  const client = requireSupabase();
  const { error } = await client
    .from("invites")
    .update({ used_at: new Date().toISOString(), used_by: usedBy })
    .eq("id", id);

  if (error) throw error;
}

export async function listInvites() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("invites")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function revokeInvite(id) {
  const client = requireSupabase();
  const { error } = await client
    .from("invites")
    .delete()
    .eq("id", id)
    .is("used_at", null);

  if (error) throw error;
}


