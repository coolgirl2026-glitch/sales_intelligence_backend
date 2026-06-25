import {
  getUserAnalyses,
  getAnalysisById,
  toggleStarAnalysis,
  deleteAnalysis,
  touchAnalysisAccess,
} from "../../database/repositories/analysis.repository.js";
import { getSharedWorkspaceUserId } from "../auth/auth.service.js";

export async function fetchUserHistory({ tool, agent }) {
  const dbUserId = await getSharedWorkspaceUserId();
  return getUserAnalyses(dbUserId, { tool, agent });
}

export async function fetchAnalysisById(id) {
  const dbUserId = await getSharedWorkspaceUserId();
  return getAnalysisById(id, dbUserId);
}

export async function starAnalysis(id, isStarred) {
  const dbUserId = await getSharedWorkspaceUserId();
  return toggleStarAnalysis(id, dbUserId, isStarred);
}

export async function removeAnalysis(id) {
  const dbUserId = await getSharedWorkspaceUserId();
  return deleteAnalysis(id, dbUserId);
}

export async function touchAnalysis(id, accessedByName) {
  return touchAnalysisAccess(id, accessedByName || "Unknown");
}
