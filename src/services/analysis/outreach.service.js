import { runAnalysisPipeline } from "./base.service.js";
import {
  saveOutreachMessage,
  markOutreachSent,
  getUserOutreach,
} from "../../database/repositories/outreach.repository.js";
import { getSharedWorkspaceUserId } from "../auth/auth.service.js";

export async function generateOutreach(payload) {
  return runAnalysisPipeline({
    ...payload,
    tool: "outreach"
  });
}

export async function saveMessage(payload) {
  const dbUserId = await getSharedWorkspaceUserId();
  return saveOutreachMessage(dbUserId, payload);
}

export async function markSent(outreachId) {
  const dbUserId = await getSharedWorkspaceUserId();
  return markOutreachSent(outreachId, dbUserId);
}

export async function fetchOutreach() {
  const dbUserId = await getSharedWorkspaceUserId();
  return getUserOutreach(dbUserId);
}
