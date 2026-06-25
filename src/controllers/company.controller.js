import { fetchUserCompanies } from "../services/research/research.service.js";
import { isSupabaseConfigured } from "../database/supabase.client.js";

function checkSupabase(res) {
  if (!isSupabaseConfigured) {
    res.status(500).json({ error: "Supabase is not configured. This feature is unavailable." });
    return false;
  }
  return true;
}

export async function getCompanies(req, res, next) {
  if (!checkSupabase(res)) return;
  try {
    const companies = await fetchUserCompanies();
    return res.status(200).json({ companies });
  } catch (err) {
    next(err);
  }
}
