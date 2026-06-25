import { runAnalysisPipeline } from "./base.service.js";

export async function generateIntelligence(payload) {
  return runAnalysisPipeline({
    ...payload,
    tool: "intelligence"
  });
}
