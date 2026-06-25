import { generateIntelligence } from "../services/analysis/intelligence.service.js";
import { generateDiscovery } from "../services/analysis/discovery.service.js";
import { generateOutreach } from "../services/analysis/outreach.service.js";
import { generateExecution } from "../services/analysis/execution.service.js";
import { generateProposal } from "../services/analysis/proposal.service.js";
import { VALID_AGENTS, VALID_TOOLS } from "../config/constants.js";

export async function generate(req, res, next) {
  const { agent, tool, values, forceRefresh, forceNewWebSearch } = req.body;

  if (!agent || !tool || !values) {
    return res.status(400).json({
      error: "Missing required fields: agent, tool, values",
    });
  }

  if (!VALID_AGENTS.includes(agent)) {
    return res.status(400).json({ error: `Invalid agent. Must be one of: ${VALID_AGENTS.join(", ")}` });
  }
  if (!VALID_TOOLS.includes(tool)) {
    return res.status(400).json({ error: `Invalid tool. Must be one of: ${VALID_TOOLS.join(", ")}` });
  }

  try {
    let result;
    const payload = { agent, values, forceRefresh, forceNewWebSearch, user: req.user, tool };

    const t = tool.toLowerCase();
    if (t === "intelligence") {
      result = await generateIntelligence(payload);
    } else if (t === "icp" || t === "discovery" || t === "opportunity-discovery") {
      result = await generateDiscovery(payload);
    } else if (t === "outreach") {
      result = await generateOutreach(payload);
    } else if (t === "execution") {
      result = await generateExecution(payload);
    } else if (t === "proposal") {
      result = await generateProposal(payload);
    } else {
      return res.status(400).json({ error: `Invalid tool. Must be one of: ${VALID_TOOLS.join(", ")}` });
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
