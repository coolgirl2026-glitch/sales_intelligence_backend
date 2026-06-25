import { saveMessage, markSent, fetchOutreach } from "../services/analysis/outreach.service.js";
import { isSupabaseConfigured } from "../database/supabase.client.js";

function checkSupabase(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. This feature is unavailable." });
    return false;
  }
  return true;
}

export async function save(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const { analysisId, companyId, channel, subject, content } = req.body;
    if (!channel || !content) {
      return res.status(400).json({ error: "channel and content are required" });
    }
    const outreach = await saveMessage({ analysisId, companyId, channel, subject, content });
    return res.status(200).json({ outreach });
  } catch (err) {
    next(err);
  }
}

export async function sent(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const outreach = await markSent(req.params.id);
    return res.status(200).json({ outreach });
  } catch (err) {
    next(err);
  }
}

export async function listOutreach(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const messages = await fetchOutreach();
    return res.status(200).json({ messages });
  } catch (err) {
    next(err);
  }
}
