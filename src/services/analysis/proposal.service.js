import { runAnalysisPipeline } from "./base.service.js";

export async function generateProposal(payload) {
  return runAnalysisPipeline({
    ...payload,
    tool: "proposal"
  });
}
