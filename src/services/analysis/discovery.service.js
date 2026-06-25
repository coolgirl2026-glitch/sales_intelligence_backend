import { runAnalysisPipeline } from "./base.service.js";

export async function generateDiscovery(payload) {
  const tool = payload.tool || "discovery";
  return runAnalysisPipeline({
    ...payload,
    tool
  });
}
