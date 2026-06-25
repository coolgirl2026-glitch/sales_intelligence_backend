import { ASPIRE_SYSTEM_PROMPT } from "../../prompts/aspire.js";
import { THRIVING_SYSTEM_PROMPT } from "../../prompts/thriving.js";
import {
  buildWebResearchPrompt,
  buildIntelligencePrompt,
  buildOpportunityDiscoveryPrompt,
  buildOutreachPrompt,
  buildExecutionPrompt,
  buildProposalPrompt,
  buildDeepAuditPrompt,
} from "../../prompts/userMessages.js";

export function getSystemPrompt(agent) {
  const norm = typeof agent === "string" ? agent.toLowerCase() : "";
  if (norm === "aspire") return ASPIRE_SYSTEM_PROMPT;
  if (norm === "thriving" || norm === "thriving workplace") return THRIVING_SYSTEM_PROMPT;
  throw new Error(`Unknown agent: ${agent}`);
}

export function getUserMessage(tool, values, agent, webResearch = null, historicalMemoryContext = null) {
  if (tool === "intelligence") return buildIntelligencePrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "icp") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "discovery") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "opportunity-discovery") return buildOpportunityDiscoveryPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "outreach") return buildOutreachPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "execution") return buildExecutionPrompt(values, agent, webResearch, historicalMemoryContext);
  if (tool === "proposal") return buildProposalPrompt(values, agent, webResearch, historicalMemoryContext);
  throw new Error(`Unknown tool: ${tool}`);
}

export { buildWebResearchPrompt, buildDeepAuditPrompt };
