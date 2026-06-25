import { runAnalysisPipeline } from "./base.service.js";

export async function generateExecution(payload) {
  return runAnalysisPipeline({
    ...payload,
    tool: "execution"
  });
}
