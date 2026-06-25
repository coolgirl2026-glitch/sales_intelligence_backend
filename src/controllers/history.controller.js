import {
  fetchUserHistory,
  fetchAnalysisById,
  starAnalysis,
  removeAnalysis,
  touchAnalysis,
} from "../services/history/history.service.js";
import { isSupabaseConfigured } from "../database/supabase.client.js";

function checkSupabase(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. History is unavailable." });
    return false;
  }
  return true;
}

export async function getHistory(req, res, next) {
  const { tool, agent } = req.query;
  try {
    const analyses = await fetchUserHistory({ tool, agent });
    return res.status(200).json({ analyses });
  } catch (err) {
    next(err);
  }
}

export async function getHistoryItem(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const analysis = await fetchAnalysisById(req.params.id);
    return res.status(200).json({ analysis });
  } catch (err) {
    next(err);
  }
}

export async function toggleStar(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const { isStarred } = req.body;
    const updated = await starAnalysis(req.params.id, isStarred);
    return res.status(200).json({ analysis: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteHistoryItem(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    await removeAnalysis(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function touchHistoryItem(req, res, next) {
  try {
    const accessedByName = req.user?.name || "Unknown";
    await touchAnalysis(req.params.id, accessedByName);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
