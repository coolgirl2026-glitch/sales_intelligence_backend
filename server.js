import express from "express";
import cors from "cors";
import "dotenv/config";

import { randomUUID, randomBytes } from "node:crypto";
import { ASPIRE_SYSTEM_PROMPT } from "./prompts/aspire.js";
import { THRIVING_SYSTEM_PROMPT } from "./prompts/thriving.js";
import {
  buildWebResearchPrompt,
  buildIntelligencePrompt,
  buildOpportunityDiscoveryPrompt,
  buildOutreachPrompt,
  buildExecutionPrompt,
  buildProposalPrompt,
  buildDeepAuditPrompt,
} from "./prompts/userMessages.js";
import { logTokenUsage, normalizeUsage } from "./tokenUsage.js";
import { compressSalesPayload } from "./graphify-layer/graphifyEngine.js";
import {
  isSupabaseConfigured,
  resolveOrCreateUser,
  getUserAnalyses,
  saveAnalysis,
  upsertCompany,
  getCachedResearch,
  saveCachedResearch,
  getUserCompanies,
  getAnalysisById,
  toggleStarAnalysis,
  deleteAnalysis,
  saveOutreachMessage,
  markOutreachSent,
  getUserOutreach,
  createLoginAccount,
  findLoginAccountByEmail,
  touchLoginLastSeen,
  touchAnalysisAccess,
  listLoginAccounts,
  updateLoginStatus,
  updateLoginRole,
  createInvite,
  findInviteByCode,
  markInviteUsed,
  listInvites,
  revokeInvite,
} from "./supabase.js";
import { hashPassword, comparePassword, signToken, requireAuth, requireAdmin } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 3001;
const ANALYSIS_MODEL = process.env.OPENROUTER_ANALYSIS_MODEL || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4";
const SEARCH_MODEL = process.env.OPENROUTER_SEARCH_MODEL || "perplexity/sonar";
const ANALYSIS_MAX_TOKENS = Number(process.env.OPENROUTER_ANALYSIS_MAX_TOKENS || process.env.OPENROUTER_MAX_TOKENS || 1400);
const SEARCH_MAX_TOKENS = Number(process.env.OPENROUTER_SEARCH_MAX_TOKENS || 800);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// Allow requests from your Vite frontend on port 5173
// Add your deployed frontend URL here later when you deploy
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:4173",
      "null",
      process.env.FRONTEND_URL, // set this in .env when you deploy
    ].filter(Boolean),
    methods: ["POST", "GET", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "user-id", "Authorization"],
  })
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summarizePriorAnalysis(analysis, tool) {
  if (!analysis) return "";
  try {
    const data = typeof analysis === "string" ? JSON.parse(analysis) : analysis;
    const bullets = [];

    if (tool === "sales_intelligence") {
      if (data.specialNote) {
        bullets.push(`Executive Insight: ${data.specialNote}`);
      }
      if (Array.isArray(data.sections)) {
        for (const sec of data.sections) {
          if (sec.title === "Likely Pain Points" && Array.isArray(sec.items)) {
            bullets.push(`Likely Pain Points: ${sec.items.slice(0, 3).join(", ")}`);
          } else if (sec.title === "Recommended Pitch Angle" && sec.text) {
            bullets.push(`Recommended Pitch: ${sec.text}`);
          } else if (sec.title === "Recommended Positioning" && sec.text) {
            bullets.push(`Positioning: ${sec.text}`);
          }
        }
      }
    } else if (tool === "opportunity_discovery") {
      bullets.push(`Fit: ${data.fitLevel || "N/A"} (Aspire: ${data.aspireScore || 0}, Thriving: ${data.thrivingScore || 0})`);
      if (data.urgency) bullets.push(`Urgency: ${data.urgency}`);
      if (data.recommendation) bullets.push(`Recommendation: ${data.recommendation}`);
      if (data.reasoning) bullets.push(`Reasoning: ${data.reasoning}`);
    } else if (tool === "outreach_generator") {
      if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          if (msg.channel && msg.content) {
            const cleanContent = msg.content.length > 80 ? msg.content.substring(0, 80) + "..." : msg.content;
            bullets.push(`${msg.channel}: ${cleanContent}`);
          }
        }
      }
    } else if (tool === "deal_execution") {
      if (data.nextBestAction) {
        bullets.push(`Next Best Action: Do "${data.nextBestAction.insteadDo}" (Instead of "${data.nextBestAction.doNotDo}")`);
      }
      if (data.objectionIntelligence) {
        bullets.push(`Objection Heard: "${data.objectionIntelligence.phraseHeard}" -> Concern: ${data.objectionIntelligence.actualConcern}`);
      }
      if (Array.isArray(data.sections)) {
        const bestFit = data.sections.find(s => s.title === "Best Fit Product");
        if (bestFit && bestFit.text) {
          bullets.push(`Best Fit Product: ${bestFit.text}`);
        }
      }
    } else if (tool === "proposal_intelligence") {
      if (Array.isArray(data.sections)) {
        const solution = data.sections.find(s => s.title === "Recommended Solution");
        if (solution && solution.text) {
          bullets.push(`Recommended Solution: ${solution.text}`);
        }
        const challenges = data.sections.find(s => s.title === "Identified Challenges");
        if (challenges && challenges.text) {
          bullets.push(`Identified Challenges: ${challenges.text}`);
        }
        const outcomes = data.sections.find(s => s.title === "Targeted Outcomes");
        if (outcomes && outcomes.text) {
          bullets.push(`Targeted Outcomes: ${outcomes.text}`);
        }
      }
    }

    // Fallback if we didn't get enough bullets
    if (bullets.length === 0) {
      if (data.specialNote) bullets.push(data.specialNote);
      if (data.recommendation) bullets.push(data.recommendation);
      if (Array.isArray(data.sections)) {
        for (const sec of data.sections.slice(0, 3)) {
          if (sec.text) {
            bullets.push(`${sec.title}: ${sec.text}`);
          } else if (Array.isArray(sec.items)) {
            bullets.push(`${sec.title}: ${sec.items.slice(0, 2).join(", ")}`);
          }
        }
      }
    }

    const finalBullets = bullets.filter(Boolean).slice(0, 5);
    if (finalBullets.length > 0) {
      return finalBullets.map(b => `- ${b}`).join("\n");
    }
    return "";
  } catch (err) {
    console.error("Error summarizing prior analysis:", err);
    return "";
  }
}

function getSystemPrompt(agent) {
  const norm = typeof agent === "string" ? agent.toLowerCase() : "";
  if (norm === "aspire") return ASPIRE_SYSTEM_PROMPT;
  if (norm === "thriving" || norm === "thriving workplace") return THRIVING_SYSTEM_PROMPT;
  throw new Error(`Unknown agent: ${agent}`);
}

function getUserMessage(tool, values, agent, webResearch = null, historicalMemoryContext = null) {
  if (tool === "intelligence") return buildIntelligencePrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "icp") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "discovery") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "opportunity-discovery") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "outreach") return buildOutreachPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "execution") return buildExecutionPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "proposal") return buildProposalPrompt(values, agent, webResearch, historicalMemoryContext);
  throw new Error(`Unknown tool: ${tool}`);
}

async function callPerplexityWebSearch(companyName, websiteUrl, agent, tool, values, apiKey) {
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

async function callOpenRouter({ apiKey, model, maxTokens, messages, responseFormat = null, temperature = null }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
      "X-Title": "Sales Copilot",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(temperature !== null ? { temperature } : {}),
    }),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || text || "OpenRouter API request failed";
    const isCreditIssue = response.status === 402 || message.toLowerCase().includes("credits");

    throw Object.assign(new Error(
      isCreditIssue
        ? "OpenRouter credits are too low for this request. Add credits or lower the model token limits."
        : message
    ), {
      status: response.status,
      details: text,
      model,
    });
  }

  return data;
}

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Sales Intelligence Backend Running"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Sales Copilot backend is running",
    supabaseConfigured: isSupabaseConfigured,
  });
});

// Every signed-in person shares ONE workspace: their individual login (in the
// `login` table) is purely for authentication, but all actual work
// (companies/analyses/outreach) is read and written against this single
// underlying Supabase Auth user, so it's visible to every other signed-in
// person. This UUID is resolved once and cached for the life of the process.
let cachedSharedUserUuid = null;
async function getSharedWorkspaceUserId() {
  if (cachedSharedUserUuid) return cachedSharedUserUuid;
  cachedSharedUserUuid = await resolveOrCreateUser("sales-team@example.com", "Sales@123");
  return cachedSharedUserUuid;
}

// ─── Authentication (individual accounts, shared workspace) ──────────────────

app.post("/api/auth/signup", async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const { name, email, password, inviteCode } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.trim();
    const existing = await findLoginAccountByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists. Try signing in." });
    }

    // No invite code → this signup itself becomes the "join request": the
    // account is created right away (so they can sign back in to check
    // status) but sits as role=member/status=pending until an admin
    // approves or rejects it in the Members panel.
    let role = "member";
    let status = "pending";
    let invitedBy = null;
    let invite = null;

    if (inviteCode?.trim()) {
      invite = await findInviteByCode(inviteCode.trim());
      if (!invite) {
        return res.status(400).json({ error: "That invite code is invalid, expired, or already used." });
      }
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: "That invite code has expired. Ask your admin for a new one." });
      }
      if (invite.email && invite.email.toLowerCase() !== normalizedEmail.toLowerCase()) {
        return res.status(400).json({ error: "This invite code was issued for a different email address." });
      }
      role = invite.role || "member";
      status = "active";
      invitedBy = invite.created_by || null;
    }

    const passwordHash = await hashPassword(password);
    const account = await createLoginAccount({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      status,
      invitedBy,
    });

    if (invite) {
      await markInviteUsed(invite.id, account.id);
    }

    const token = signToken(account);
    return res.status(201).json({
      token,
      user: { id: account.id, name: account.name, email: account.email, role: account.role, status: account.status },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to create account" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const account = await findLoginAccountByEmail(email.trim());
    if (!account) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await comparePassword(password, account.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    await touchLoginLastSeen(account.id);

    // Login succeeds for pending/rejected accounts too (status is returned
    // below) — requireAuth() blocks them from every OTHER route, and the
    // frontend uses this status to show a "pending approval" / "declined"
    // screen instead of a confusing generic error.
    const token = signToken(account);
    return res.status(200).json({
      token,
      user: { id: account.id, name: account.name, email: account.email, role: account.role, status: account.status },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// Used by the frontend on page load to validate a stored token without
// requiring the person to re-enter credentials — this is the "continuous
// authentication" piece: the session survives reloads until the token
// expires (30 days) or they sign out. allowPending so pending/rejected users
// can still load their own status here (every other route blocks them).
app.get("/api/auth/me", requireAuth({ allowPending: true }), (req, res) => {
  return res.status(200).json({ user: req.user });
});

// ─── Members list (visible to every signed-in, active person) ────────────────

app.get("/api/members", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const members = await listLoginAccounts({ status: "active" });
    return res.status(200).json({ members });
  } catch (err) {
    console.error("Members fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch members" });
  }
});

// ─── Admin: join requests, invites, direct user creation, roles ─────────────

app.get("/api/admin/requests", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const requests = await listLoginAccounts({ status: "pending" });
    return res.status(200).json({ requests });
  } catch (err) {
    console.error("Pending requests fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

app.patch("/api/admin/requests/:id/approve", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const role = req.body?.role === "admin" ? "admin" : "member";
    await updateLoginRole(req.params.id, role);
    const updated = await updateLoginStatus(req.params.id, "active", { approvedBy: req.user.id });
    return res.status(200).json({ account: updated });
  } catch (err) {
    console.error("Approve request error:", err);
    return res.status(500).json({ error: "Failed to approve request" });
  }
});

app.patch("/api/admin/requests/:id/reject", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const updated = await updateLoginStatus(req.params.id, "rejected", { approvedBy: req.user.id });
    return res.status(200).json({ account: updated });
  } catch (err) {
    console.error("Reject request error:", err);
    return res.status(500).json({ error: "Failed to reject request" });
  }
});

app.patch("/api/admin/users/:id/role", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const role = req.body?.role;
    if (role !== "admin" && role !== "member") {
      return res.status(400).json({ error: "role must be 'admin' or 'member'" });
    }
    if (req.params.id === req.user.id && role === "member") {
      return res.status(400).json({ error: "You can't demote yourself. Ask another admin to do it." });
    }
    const updated = await updateLoginRole(req.params.id, role);
    return res.status(200).json({ account: updated });
  } catch (err) {
    console.error("Role update error:", err);
    return res.status(500).json({ error: "Failed to update role" });
  }
});

app.patch("/api/admin/users/:id/revoke", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "You can't revoke your own access." });
    }
    const updated = await updateLoginStatus(req.params.id, "rejected", { approvedBy: req.user.id });
    return res.status(200).json({ account: updated });
  } catch (err) {
    console.error("Revoke access error:", err);
    return res.status(500).json({ error: "Failed to revoke access" });
  }
});

// Admin creates a fully active account directly (no signup/approval needed —
// useful for onboarding someone who can't or shouldn't self-register).
app.post("/api/admin/users", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const { name, email, password, role } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.trim();
    const existing = await findLoginAccountByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const account = await createLoginAccount({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: role === "admin" ? "admin" : "member",
      status: "active",
      approvedBy: req.user.id,
    });

    return res.status(201).json({ account });
  } catch (err) {
    console.error("Admin create-user error:", err);
    return res.status(err.status || 500).json({ error: err.message || "Failed to create account" });
  }
});

app.get("/api/admin/invites", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const invites = await listInvites();
    return res.status(200).json({ invites });
  } catch (err) {
    console.error("Invites fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch invites" });
  }
});

app.post("/api/admin/invites", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const { email, role, expiresInDays } = req.body || {};
    const code = randomBytes(9).toString("hex"); // 18-char invite code
    const expiresAt = expiresInDays ? new Date(Date.now() + Number(expiresInDays) * 86400000).toISOString() : null;

    const invite = await createInvite({
      email: email?.trim() || null,
      code,
      role: role === "admin" ? "admin" : "member",
      createdBy: req.user.id,
      expiresAt,
    });

    return res.status(201).json({ invite });
  } catch (err) {
    console.error("Invite create error:", err);
    return res.status(500).json({ error: "Failed to create invite" });
  }
});

app.delete("/api/admin/invites/:id", requireAuth(), requireAdmin, async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    await revokeInvite(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Invite revoke error:", err);
    return res.status(500).json({ error: "Failed to revoke invite" });
  }
});

app.get("/api/history", requireAuth(), async (req, res) => {
  const { tool, agent } = req.query;

  if (!isSupabaseConfigured) {
    return res.status(500).json({ error: "Supabase is not configured. History is unavailable." });
  }

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const analyses = await getUserAnalyses(dbUserId, { tool, agent });
    return res.status(200).json({ analyses });
  } catch (err) {
    console.error("History fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch history", details: err.message });
  }
});

// ─── Main generate endpoint ───────────────────────────────────────────────────

app.post("/api/generate", requireAuth(), async (req, res) => {
  const { agent, tool, values, forceRefresh } = req.body;
  const userId = await getSharedWorkspaceUserId();

  // Mock mode: return a canned response for frontend testing without external APIs
  if (process.env.MOCK_GENERATE === "true") {
    const mockOutput = {
      summary: "Mock analysis",
      recommendations: [
        { title: "Reach out via LinkedIn", rationale: "High ICP fit" },
      ],
      details: { company: values?.company || "Test Company" },
    };

    return res.status(200).json({ output: mockOutput, requestId: "mock-request", analysisId: null });
  }

  // 1. Validate inputs
  if (!agent || !tool || !values) {
    return res.status(400).json({
      error: "Missing required fields: agent, tool, values",
    });
  }

  const validAgents = ["aspire", "thriving", "Aspire", "Thriving Workplace"];
  const validTools = ["intelligence", "icp", "discovery", "outreach", "execution", "proposal", "opportunity-discovery"];

  if (!validAgents.includes(agent)) {
    return res.status(400).json({ error: `Invalid agent. Must be one of: ${validAgents.join(", ")}` });
  }
  if (!validTools.includes(tool)) {
    return res.status(400).json({ error: `Invalid tool. Must be one of: ${validTools.join(", ")}` });
  }

  // 2. Check API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    console.error("OPENROUTER_API_KEY is not set");
    return res.status(500).json({ error: "Server configuration error: OpenRouter API key not set" });
  }

  try {
    const requestId = randomUUID();
    const companyName = values.company;

    const forceNewWebSearch = req.body.forceNewWebSearch !== undefined 
      ? req.body.forceNewWebSearch 
      : (req.body.values?.forceNewWebSearch !== undefined ? req.body.values.forceNewWebSearch : forceRefresh);

    let webResearch = null;
    let searchData = null;
    let strategy = "Cached Analysis Only";
    let perplexityTokens = 0;
    let perplexityCost = 0; // cost in USD
    let historicalMemoryContext = "";
    let record = null;

    // STRICT GUARD PATH: Generate Analysis (forceNewWebSearch is FALSE)
    if (!forceNewWebSearch) {
      if (!companyName) {
        return res.status(400).json({ success: false, error: "Company name is required." });
      }
      record = await getCachedResearch(companyName);
      if (!record || !record.raw_perplexity_data) {
        return res.status(400).json({
          success: false,
          error: "No data saved before. Please run a Live Search first to fetch company data."
        });
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

    // 3. Build prompts (passing resolved webResearch directly into prompt builders)
    const rawSystemPrompt = getSystemPrompt(agent);
    const rawUserMessage = getUserMessage(tool, values, agent, webResearch, historicalMemoryContext);

    // Pipe prompts through the Graphify optimizer context wrapper. This is a
    // best-effort token-cost optimization, not a core part of the use case —
    // never let it block analysis generation if it errors or is unconfigured.
    let systemPrompt = rawSystemPrompt;
    let userMessage = rawUserMessage;
    try {
      const compressed = await compressSalesPayload(rawSystemPrompt, rawUserMessage);
      if (compressed?.compressedSystemPrompt && compressed?.compressedUserMessage) {
        systemPrompt = compressed.compressedSystemPrompt;
        userMessage = compressed.compressedUserMessage;
      }
    } catch (compressErr) {
      console.error("Graphify compression failed, falling back to uncompressed prompts:", compressErr.message);
    }

    // 5. Structured sales analysis with Claude
    const analysisData = await callOpenRouter({
      apiKey,
      model: ANALYSIS_MODEL,
      maxTokens: ANALYSIS_MAX_TOKENS,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const exchangeRate = 95.27;
    const perpCostINR = Number((perplexityCost * exchangeRate).toFixed(6));

    const clUsage = analysisData?.usage || {};
    const clPromptTokens = clUsage.prompt_tokens ?? clUsage.input_tokens ?? 0;
    const clCompletionTokens = clUsage.completion_tokens ?? clUsage.output_tokens ?? 0;
    const clTokensUsed = clPromptTokens + clCompletionTokens;
    const clCostUSD = (clPromptTokens * 0.000003) + (clCompletionTokens * 0.000015);
    const clCostINR = Number((clCostUSD * exchangeRate).toFixed(6));

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

    // 6. Parse Claude response
    const rawText = analysisData?.choices?.[0]?.message?.content ?? "";
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        } catch {
          console.error("Failed to parse AI JSON output:", cleaned);
          return res.status(500).json({
            error: "AI returned invalid JSON. Please try again.",
            raw: cleaned,
          });
        }
      } else {
        console.error("Failed to parse AI JSON output:", cleaned);
        return res.status(500).json({
          error: "AI returned invalid JSON. Please try again.",
          raw: cleaned,
        });
      }
    }

    // Save final Claude analysis JSON into Supabase
    if (companyName && isSupabaseConfigured) {
      try {
        await saveCachedResearch(companyName, webResearch, tool, parsed, values.linkedinUrl || null);
      } catch (dbErr) {
        console.error("Supabase cache save error (non-fatal):", dbErr.message);
      }
    }

    let analysisId = null;
    if (userId && isSupabaseConfigured) {
      try {
        const company = await upsertCompany(userId, values);
        const savedAnalysis = await saveAnalysis(userId, company?.id, {
          agent: agent.toLowerCase().includes("thriving") ? "thriving" : "aspire",
          tool,
          inputValues: values,
          output: parsed,
          createdByLoginId: req.user?.id || null,
          createdByName: req.user?.name || null,
        });
        analysisId = savedAnalysis.id;
      } catch (dbErr) {
        console.error("Supabase save error (non-fatal):", dbErr.message);
      }
    }

    // 8. Return parsed output to frontend
    return res.status(200).json({ 
      output: parsed, 
      requestId, 
      analysisId, 
      canonicalCompany: record?.company_name || companyName 
    });

  } catch (err) {
    console.error("Unexpected server error:", err);
    return res.status(err.status ? 502 : 500).json({
      error: err.message || "Internal server error. Please try again.",
      model: err.model,
      details: err.details,
    });
  }
});

app.post('/api/audit-generation', requireAuth(), async (req, res) => {
  try {
    const { company, website, inputs, outputData } = req.body;
    const userId = await getSharedWorkspaceUserId();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === "your_openrouter_api_key_here") {
      console.error("OPENROUTER_API_KEY is not set");
      return res.status(500).json({ success: false, error: "Server configuration error: OpenRouter API key not set" });
    }
    let webResearch = null;
    if (company && isSupabaseConfigured) {
      try {
        const record = await getCachedResearch(company);
        webResearch = record?.raw_perplexity_data;
      } catch (dbErr) {
        console.error("Supabase cache read error in audit:", dbErr);
      }
    }

    const AUDIT_MODEL = process.env.OPENROUTER_AUDIT_MODEL || ANALYSIS_MODEL;
    const auditPrompt = buildDeepAuditPrompt(company, website, inputs, outputData, webResearch);
    const opusResponse = await callOpenRouter({
      apiKey,
      model: AUDIT_MODEL,
      messages: [{ role: "user", content: auditPrompt }],
      maxTokens: 1500,
      temperature: 0.1,
      responseFormat: { type: "json_object" }
    });

    const exchangeRate = 95.27;
    const clUsage = opusResponse?.usage || {};
    const clPromptTokens = clUsage.prompt_tokens ?? clUsage.input_tokens ?? 0;
    const clCompletionTokens = clUsage.completion_tokens ?? clUsage.output_tokens ?? 0;
    const clTokensUsed = clPromptTokens + clCompletionTokens;
    const clCostUSD = (clPromptTokens * 0.000003) + (clCompletionTokens * 0.000015);
    const clCostINR = Number((clCostUSD * exchangeRate).toFixed(6));

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
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } else {
        throw parseErr;
      }
    }

    return res.status(200).json({ success: true, audit: parsed, webResearchUsed: !!webResearch });
  } catch (err) {
    console.error("Opus Audit Engine failure:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── History / company / outreach CRUD ───────────────────────────────────────
// Ported from the older supabase-setup backend during the June 2026 merge.
// These require Supabase to be configured.

function requireSupabaseConfigured(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. This feature is unavailable." });
    return false;
  }
  return true;
}

app.get("/api/history/:id", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const analysis = await getAnalysisById(req.params.id, dbUserId);
    return res.status(200).json({ analysis });
  } catch (err) {
    console.error("Analysis fetch error:", err);
    return res.status(404).json({ error: "Analysis not found" });
  }
});

app.patch("/api/history/:id/star", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const { isStarred } = req.body;
    const updated = await toggleStarAnalysis(req.params.id, dbUserId, isStarred);
    return res.status(200).json({ analysis: updated });
  } catch (err) {
    console.error("Star toggle error:", err);
    return res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/history/:id", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    await deleteAnalysis(req.params.id, dbUserId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({ error: "Failed to delete" });
  }
});

// Records that the current user opened/viewed a history item.
// Called by the frontend when someone clicks "Open" on a Recents entry.
app.patch("/api/history/:id/touch", requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;
    const accessedByName = req.user?.name || "Unknown";
    await touchAnalysisAccess(id, accessedByName);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Touch analysis access error:", err);
    return res.status(500).json({ error: "Failed to record access" });
  }
});

app.get("/api/companies", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const companies = await getUserCompanies(dbUserId);
    return res.status(200).json({ companies });
  } catch (err) {
    console.error("Companies fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch companies" });
  }
});

app.post("/api/outreach/save", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const { analysisId, companyId, channel, subject, content } = req.body;
    if (!channel || !content) {
      return res.status(400).json({ error: "channel and content are required" });
    }
    const saved = await saveOutreachMessage(dbUserId, { analysisId, companyId, channel, subject, content });
    return res.status(200).json({ outreach: saved });
  } catch (err) {
    console.error("Outreach save error:", err);
    return res.status(500).json({ error: "Failed to save outreach" });
  }
});

app.patch("/api/outreach/:id/sent", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const updated = await markOutreachSent(req.params.id, dbUserId);
    return res.status(200).json({ outreach: updated });
  } catch (err) {
    console.error("Outreach mark-sent error:", err);
    return res.status(500).json({ error: "Failed to update outreach" });
  }
});

app.get("/api/outreach", requireAuth(), async (req, res) => {
  if (!requireSupabaseConfigured(res)) return;

  try {
    const dbUserId = await getSharedWorkspaceUserId();
    const messages = await getUserOutreach(dbUserId);
    return res.status(200).json({ messages });
  } catch (err) {
    console.error("Outreach fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch outreach" });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✅ Sales Copilot backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Generate API: http://localhost:${PORT}/api/generate\n`);
});
